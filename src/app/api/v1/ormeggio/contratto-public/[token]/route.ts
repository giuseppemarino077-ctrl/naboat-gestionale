import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { paymentConfig } from "@/lib/payments";
import { clientIp, rateLimit } from "@/lib/ratelimit";

// Contratto di ormeggio/rimessaggio: pagina pubblica raggiungibile solo con il token riservato.
async function daToken(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.contrattoOrmeggio.findUnique({
    where: { token },
    include: {
      permanenza: {
        include: {
          boat: { include: { proprietario: true } },
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

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const c = await daToken(token);
  if (!c) return fail("Link non valido", 404);
  const p = c.permanenza;
  const cfg = await paymentConfig(p.tenantId);
  const totaleAddebitiCent = p.addebiti.reduce((s, a) => s + a.importoCent, 0);
  const incassatoCent = p.payments.filter((x) => x.stato === "pagato").reduce((s, x) => s + x.totaleCent, 0);
  const residuoCent = Math.max(0, totaleAddebitiCent - incassatoCent);
  return ok({
    azienda: p.tenant.nome,
    logo: p.tenant.logoUrl,
    telefonoAzienda: p.tenant.telefonoContatto,
    indirizzo: p.tenant.indirizzoPartenza,
    tipo: c.tipo,
    proprietario: p.boat.proprietario,
    barca: { nome: p.boat.nome, tipo: p.boat.tipo },
    posto: p.posto.codice,
    area: p.posto.area.nome,
    inizioAt: p.inizioAt,
    finePrevistaAt: p.finePrevistaAt,
    corrispettivoCent: p.corrispettivoCent,
    servizi: p.attivita.map((a) => ({ tipo: a.tipo, quantita: a.quantita, unita: a.unita, prezzoCent: a.prezzoCent })),
    conto: { totaleAddebitiCent, incassatoCent, residuoCent },
    pagamentoAbilitato: !!cfg?.stripePronto,
    firmatoAt: c.firmatoAt,
    firmaNome: c.firmaNome,
    pagato: residuoCent <= 0 && totaleAddebitiCent > 0,
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const ip = clientIp(req);
  if (!(await rateLimit(`rl:contratto-ormeggio:${ip}`, 20, 3600)).ok) return fail("Troppi tentativi: riprova più tardi", 429);
  const { token } = await ctx.params;
  const c = await daToken(token);
  if (!c) return fail("Link non valido", 404);
  if (c.firmatoAt) return fail("Contratto già firmato", 422);
  const body = await req.json().catch(() => null);
  const nome = String(body?.nome ?? "").trim();
  if (body?.accettato !== true) return fail("Devi accettare le condizioni per firmare", 422);
  if (nome.length < 3 || nome.length > 120) return fail("Scrivi nome e cognome completi", 422);
  const firmaIp =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "non rilevato";
  const upd = await prisma.contrattoOrmeggio.update({
    where: { id: c.id },
    data: { firmatoAt: new Date(), firmaNome: nome, firmaIp },
  });
  await prisma.auditLog.create({
    data: { tenantId: c.tenantId, azione: "ormeggio.contratto.firmato", entita: "Permanenza", entitaId: c.permanenzaId },
  });
  return ok({ firmatoAt: upd.firmatoAt, firmaNome: upd.firmaNome });
}
