import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/ratelimit";

// Contratto di noleggio: pagina pubblica accessibile solo con il token della prenotazione.
async function daToken(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.booking.findUnique({
    where: { contrattoToken: token },
    include: {
      boat: { select: { nome: true, tipo: true, capienza: true, potenzaCv: true, patenteRichiesta: true } },
      skipper: { select: { nome: true } },
      tenant: { select: { nome: true, indirizzoPartenza: true, telefonoContatto: true, logoUrl: true } },
    },
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const b = await daToken(token);
  if (!b) return fail("Link non valido", 404);

  return ok({
    azienda: b.tenant.nome,
    logo: b.tenant.logoUrl,
    puntoPartenza: b.tenant.indirizzoPartenza,
    telefono: b.tenant.telefonoContatto,
    cliente: b.clienteNome,
    passeggeri: b.passeggeri,
    inizioAt: b.startAt,
    fineAt: b.endAt,
    destinazione: b.destinazione,
    formula: b.formula,
    barca: b.boat,
    skipper: b.skipper?.nome ?? null,
    patenteOk: b.patenteOk,
    prezzoCent: b.prezzoCent,
    cauzioneCent: b.cauzioneCent,
    firmatoAt: b.contrattoFirmatoAt,
    firmaNome: b.contrattoFirmaNome,
  });
}

// Firma: il cliente conferma i dati e scrive nome e cognome.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const ip = clientIp(req);
  if (!(await rateLimit(`rl:contratto:${ip}`, 20, 3600)).ok) return fail("Troppi tentativi: riprova più tardi", 429);
  const { token } = await ctx.params;
  const b = await daToken(token);
  if (!b) return fail("Link non valido", 404);
  if (b.contrattoFirmatoAt) return fail("Contratto già firmato", 422);

  const body = await req.json().catch(() => null);
  const nome = String(body?.nome ?? "").trim();
  const accettato = body?.accettato === true;
  if (!accettato) return fail("Devi accettare le condizioni per firmare", 422);
  if (nome.length < 3 || nome.length > 120) return fail("Scrivi nome e cognome completi", 422);

  const firmaIp =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "non rilevato";

  const upd = await prisma.booking.update({
    where: { id: b.id },
    data: { contrattoFirmatoAt: new Date(), contrattoFirmaNome: nome, contrattoFirmaIp: firmaIp },
  });
  await prisma.auditLog.create({
    data: { tenantId: b.tenantId, azione: "contratto.firmato", entita: "Booking", entitaId: b.id },
  });
  return ok({ firmatoAt: upd.contrattoFirmatoAt, firmaNome: upd.contrattoFirmaNome });
}
