import { fail, ok } from "@/lib/api";
import { aggiungiGiorni, inizioGiorno, oggi } from "@/lib/calendario";
import { prisma } from "@/lib/db";
import { promemoriaBody } from "@/lib/mailer";
import { accodaNotifica, consegnaNotifica, consegnaNotifiche } from "@/lib/notifiche";
import { identitaCorrente } from "@/lib/identita";
import { mustTwoFa } from "@/lib/tenant";

// Invia i promemoria ai clienti con uscita il giorno indicato (default: domani).
// Si può avviare in due modi:
//   1) dal portale (proprietario/operatore) -> solo le proprie prenotazioni
//   2) da cron sul VPS con l'intestazione x-cron-secret -> tutte le aziende attive
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const dallCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;

  let tenantId: string | null = null;
  if (!dallCron) {
    const id = await identitaCorrente();
    if (!id.ok) {
      if (id.motivo === "no-session") return fail("Non autenticato", 401);
      return fail("Sessione non più valida: accedi di nuovo", 401);
    }
    const { session: s, user: u } = id;
    if (u.role === "superadmin") {
      if (mustTwoFa(u.role, s.twofa)) return fail("2FA obbligatoria: abilitala da /gestionale/impostazioni/sicurezza", 403);
      tenantId = new URL(req.url).searchParams.get("tenantId");
      if (!tenantId) return fail("Superadmin: specificare ?tenantId=", 400);
    } else {
      if (!u.tenantId) return fail("Nessuna azienda associata", 403);
      if (u.tenantStatus !== "active") return fail("Azienda non attiva (in attesa/sospesa)", 403);
      if (u.role !== "owner" && u.role !== "operatore") return fail("Permesso negato", 403);
      if (mustTwoFa(u.role, s.twofa)) return fail("2FA obbligatoria: abilitala da /gestionale/impostazioni/sicurezza", 403);
      tenantId = u.tenantId;
    }
  }

  const body = await req.json().catch(() => ({}));
  const data = typeof body?.data === "string" ? body.data.trim() : null;
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) return fail("Data non valida", 422);
  // Il giorno indicato (default: domani) è un giorno civile di Europe/Rome.
  const g = data ?? aggiungiGiorni(oggi(), 1);
  const da = inizioGiorno(g);
  const a = inizioGiorno(aggiungiGiorni(g, 1));

  const prenotazioni = await prisma.booking.findMany({
    where: {
      ...(tenantId ? { tenantId } : { tenant: { status: "active" } }),
      stato: { in: ["prenotata", "in_mare"] },
      startAt: { gte: da, lt: a },
      promemoriaInviatoAt: null,
    },
    include: {
      boat: { select: { nome: true } },
      customer: { select: { email: true } },
      tenant: { select: { id: true, nome: true, indirizzoPartenza: true, telefonoContatto: true } },
    },
    take: 500,
  });

  // Tentativo di consegna delle notifiche rimaste in coda dai giri precedenti
  // (il cron passa di qui): il registro è la fonte, non il log.
  await consegnaNotifiche({ limite: 100 }).catch(() => {});

  let inviati = 0;
  let senzaEmail = 0;
  let falliti = 0;

  for (const b of prenotazioni) {
    // Il contatto della prenotazione vale anche senza anagrafica (richieste ospiti).
    const email = b.email ?? b.customer?.email;
    if (!email) {
      senzaEmail++;
      continue;
    }
    const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
    const corpo = promemoriaBody({
      azienda: b.tenant.nome,
      cliente: b.clienteNome ?? "cliente",
      barca: b.boat?.nome ?? "imbarcazione",
      quando: b.startAt.toLocaleString("it-IT", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Rome" }),
      passeggeri: b.passeggeri,
      destinazione: b.destinazione,
      puntoPartenza: b.tenant.indirizzoPartenza,
      telefono: b.tenant.telefonoContatto,
      contrattoUrl: b.contrattoToken ? `${base}/contratto/${b.contrattoToken}` : null,
    });
    // Una sola notifica per prenotazione (dedup): un secondo giro non duplica.
    const n = await accodaNotifica({
      tenantId: b.tenantId,
      evento: "booking.promemoria",
      destinatario: email,
      oggetto: corpo.subject,
      testo: corpo.text,
      html: corpo.html,
      dedupKey: `promemoria:${b.id}`,
    });
    if (!n) {
      falliti++;
      continue;
    }
    const esito = await consegnaNotifica(n.id);
    if (esito === "inviata") {
      inviati++;
      await prisma.booking.update({ where: { id: b.id }, data: { promemoriaInviatoAt: new Date() } });
    } else {
      falliti++;
    }
  }

  return ok({
    giorno: g,
    trovate: prenotazioni.length,
    inviati,
    senzaEmail,
    falliti,
  });
}
