import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { paymentConfig } from "@/lib/payments";
import { ipRichiesta, type SnapshotOrmeggio } from "@/lib/contratti";

// Contratto di ormeggio/rimessaggio: pagina pubblica raggiungibile solo con il token riservato.
// Il documento (parti, barca, posto, date, corrispettivo, servizi) viene reso dalla
// versione congelata; solo il conto/pagamento restano un dato corrente.
async function daToken(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.contrattoOrmeggio.findUnique({
    where: { token },
    include: {
      permanenza: {
        include: {
          boat: { include: { proprietario: { select: { nome: true, telefono: true, email: true } } } },
          posto: { include: { area: true } },
          tenant: true,
          attivita: { where: { incluso: false } },
          addebiti: true,
          payments: true,
        },
      },
    },
  });
}

type ContrattoConPermanenza = NonNullable<Awaited<ReturnType<typeof daToken>>>;

function isSnapshot(v: unknown): v is SnapshotOrmeggio {
  return !!v && typeof v === "object" && (v as { schema?: unknown }).schema === "ormeggio/v1";
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const c = await daToken(token);
  if (!c) return fail("Link non valido", 404);
  const p = c.permanenza;
  const cfg = await paymentConfig(p.tenantId);
  const totaleAddebitiCent = p.addebiti.reduce((s, a) => s + a.importoCent, 0);
  const incassatoCent = p.payments.filter((x) => x.stato === "pagato").reduce((s, x) => s + x.totaleCent, 0);
  const residuoCent = Math.max(0, totaleAddebitiCent - incassatoCent);

  const s = isSnapshot(c.testoSnapshot) ? c.testoSnapshot : null;
  const legacy = !s;
  return ok({
    azienda: s?.azienda.nome ?? p.tenant.nome,
    logo: s?.azienda.logo ?? p.tenant.logoUrl,
    telefonoAzienda: s?.azienda.telefono ?? p.tenant.telefonoContatto,
    indirizzo: s?.azienda.indirizzo ?? p.tenant.indirizzoPartenza,
    tipo: s?.tipo ?? c.tipo,
    proprietario: s?.proprietario ?? p.boat.proprietario,
    barca: s?.barca ?? { nome: p.boat.nome, tipo: p.boat.tipo },
    posto: s?.posto ?? p.posto.codice,
    area: s?.area ?? p.posto.area.nome,
    inizioAt: s?.inizioAt ?? p.inizioAt,
    finePrevistaAt: s?.finePrevistaAt ?? p.finePrevistaAt,
    corrispettivoCent: s?.corrispettivoCent ?? p.corrispettivoCent,
    servizi: s?.servizi ?? p.attivita.map((a) => ({ tipo: a.tipo, quantita: a.quantita, unita: a.unita, prezzoCent: a.prezzoCent })),
    conto: { totaleAddebitiCent, incassatoCent, residuoCent },
    pagamentoAbilitato: !!cfg?.stripePronto,
    firmatoAt: c.firmatoAt,
    firmaNome: c.firmaNome,
    versione: legacy ? null : c.versione,
    hash: legacy ? null : c.hash,
    legacy,
    pagato: residuoCent <= 0 && totaleAddebitiCent > 0,
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const c = await daToken(token);
  if (!c) return fail("Link non valido", 404);
  if (c.firmatoAt) return fail("Contratto già firmato", 422);
  const body = await req.json().catch(() => null);
  const nome = String(body?.nome ?? "").trim();
  if (body?.accettato !== true) return fail("Devi accettare le condizioni per firmare", 422);
  if (nome.length < 3 || nome.length > 120) return fail("Scrivi nome e cognome completi", 422);

  // La firma vale solo per la versione congelata effettivamente letta.
  if (c.hash == null) return fail("Documento non disponibile: ricarica la pagina", 409);
  const versione = Number(body?.versione);
  if (!Number.isInteger(versione) || versione !== c.versione)
    return fail("Il documento è cambiato: ricarica la pagina", 409);
  if (typeof body?.hash === "string" && body.hash !== c.hash)
    return fail("Il documento è cambiato: ricarica la pagina", 409);

  const adesso = new Date();
  const aggiornato = await prisma.contrattoOrmeggio.updateMany({
    where: { id: c.id, tenantId: c.tenantId, firmatoAt: null, versione },
    data: { firmatoAt: adesso, firmaNome: nome, firmaIp: ipRichiesta(req) },
  });
  // Nessuna riga aggiornata: revisione cambiata o firma concorrente già vincente.
  if (aggiornato.count === 0) return fail("Contratto già firmato o documento cambiato: ricarica la pagina", 409);
  await prisma.auditLog.create({
    data: {
      tenantId: c.tenantId,
      azione: "ormeggio.contratto.firmato",
      entita: "Permanenza",
      entitaId: c.permanenzaId,
      dettagli: JSON.stringify({ versione, hash: c.hash }),
    },
  });
  return ok({ firmatoAt: adesso, firmaNome: nome, versione });
}
