import { fail, ok } from "@/lib/api";
import { registraAzione } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { marcaPromemoriaOpzione, opzioniInScadenza, rilasciaOpzioniScadute, type RichiestaOpzione } from "@/lib/disponibilita";
import { requireSuperadmin } from "@/lib/guard";
import { escapeHtml, sendMail, subjectSicuro } from "@/lib/mailer";
import { applicaLimitiTutti } from "@/lib/piani";
import { marcaScaduti } from "@/lib/subscriptions";
import { z } from "zod";

// Gestione piani Free/Pro dei noleggiatori (solo NaBoat).
export async function GET() {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const tenants = await prisma.tenant.findMany({
    where: { status: "active" },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, pianoTipo: true, pianoScadenzaAt: true, _count: { select: { boats: true } } },
  });
  return ok(tenants);
}

const Schema = z.object({ tenantId: z.string().uuid(), piano: z.enum(["free", "pro"]), scadenza: z.string().optional().nullable() });

export async function PATCH(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const t = await prisma.tenant.findUnique({ where: { id: p.data.tenantId }, select: { id: true } });
  if (!t) return fail("Azienda non trovata", 404);
  const aggiornata = await prisma.tenant.update({
    where: { id: t.id },
    data: { pianoTipo: p.data.piano, pianoScadenzaAt: p.data.scadenza ? new Date(p.data.scadenza) : null },
  });
  await prisma.auditLog.create({ data: { actorId: g.session.sub, azione: `piano.${p.data.piano}`, entita: "Tenant", entitaId: t.id } });
  return ok({ pianoTipo: aggiornata.pianoTipo, pianoScadenzaAt: aggiornata.pianoScadenzaAt });
}

// M05: avviso al noleggiatore. Un solo messaggio per azienda, con l'elenco delle
// richieste. Ritorna le righe coperte dall'invio riuscito (per marcare il promemoria).
async function avvisaNoleggiatori(righe: RichiestaOpzione[], tipo: "promemoria" | "scadute"): Promise<RichiestaOpzione[]> {
  if (!righe.length) return [];
  const perTenant = new Map<string, RichiestaOpzione[]>();
  for (const r of righe) {
    const lista = perTenant.get(r.tenantId) ?? [];
    lista.push(r);
    perTenant.set(r.tenantId, lista);
  }
  const quando = (d: Date) => d.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" });
  const inviate: RichiestaOpzione[] = [];
  for (const [tenantId, lista] of perTenant) {
    const owner = await prisma.user.findFirst({ where: { tenantId, role: "owner" }, select: { email: true } });
    if (!owner?.email) continue;
    const righeTesto = lista.map((r) => {
      const scad = r.opzioneScadenzaAt ? ` · opzione fino al ${quando(r.opzioneScadenzaAt)}` : "";
      return `- ${r.boat.nome}: ${r.clienteNome ?? "cliente"} · ${quando(r.startAt)}${scad}`;
    });
    const intro =
      tipo === "promemoria"
        ? ["Queste richieste dal sito stanno per scadere: se non le confermi, la barca tornerà libera.", ""]
        : ["Queste richieste dal sito sono scadute senza conferma: la barca è di nuovo libera.", ""];
    const testo = [...intro, ...righeTesto, "", "Aprì il gestionale per gestirle."].join("\n");
    const subject =
      tipo === "promemoria"
        ? subjectSicuro(`Richieste in scadenza (${lista.length})`)
        : subjectSicuro(`Richieste scadute e liberate (${lista.length})`);
    const html = `<p>${escapeHtml(intro[0])}</p><ul>${lista
      .map((r) => `<li><b>${escapeHtml(r.boat.nome)}</b>: ${escapeHtml(r.clienteNome ?? "cliente")} · ${escapeHtml(quando(r.startAt))}${r.opzioneScadenzaAt ? ` · opzione fino al ${escapeHtml(quando(r.opzioneScadenzaAt))}` : ""}</li>`)
      .join("")}</ul><p>Aprì il gestionale per gestirle.</p>`;
    const esito = await sendMail(owner.email, subject, testo, html);
    if (esito.sent) inviate.push(...lista);
  }
  return inviate;
}

// Controllo scadenze: mette in pausa le barche eccedenti dei piani Free (anche Pro scaduti)
// e rilascia le opzioni delle richieste dal sito scadute, avvisando il noleggiatore.
// Accetta lo staff NaBoat oppure il cron con x-cron-secret.
export async function POST(req: Request) {
  const cron = process.env.CRON_SECRET && req.headers.get("x-cron-secret") === process.env.CRON_SECRET;
  if (!cron) {
    const g = await requireSuperadmin();
    if ("error" in g) return g.error;
  }
  // Prima si marcano le manutenzioni scadute, poi si applicano i limiti dei piani:
  // così la scadenza è applicabile da cron anche se nessuno apre il pannello admin.
  await marcaScaduti();
  const esito = await applicaLimitiTutti();

  // M05 — opzioni delle richieste dal sito. La finestra del promemoria è la metà
  // della durata dell'opzione, con un minimo di un'ora e un massimo di 24 ore.
  const impostazioni = await prisma.platformSettings
    .findUnique({ where: { id: "singleton" }, select: { opzioneScadenzaOre: true } })
    .catch(() => null);
  const ore = Math.max(1, impostazioni?.opzioneScadenzaOre ?? 48);
  const finestraMs = Math.min(24 * 3600000, Math.max(3600000, (ore * 3600000) / 2));

  const inScadenza = await opzioniInScadenza(prisma, finestraMs);
  const inviatePromemoria = await avvisaNoleggiatori(inScadenza, "promemoria");
  let promemoriaMarcati = 0;
  for (const b of inviatePromemoria) if (await marcaPromemoriaOpzione(prisma, b.id)) promemoriaMarcati++;

  // Rilascio idempotente: solo le richieste ancora "da_confermare" cambiano stato.
  const rilasciate = await rilasciaOpzioniScadute(prisma);
  for (const b of rilasciate) {
    await registraAzione({
      tenantId: b.tenantId,
      azione: "booking.opzione_scaduta",
      entita: "Booking",
      entitaId: b.id,
      nota: "Opzione scaduta: richiesta rilasciata automaticamente",
    });
  }
  const avvisiInviati = await avvisaNoleggiatori(rilasciate, "scadute");

  return ok({
    ...esito,
    opzioni: {
      promemoria: promemoriaMarcati,
      rilasciate: rilasciate.length,
      avvisi: avvisiInviati.length,
    },
  });
}
