import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";
import { improntaContratto, snapshotNoleggio } from "@/lib/contratti";
import { randomUUID } from "crypto";

// Genera (o restituisce) il link del contratto da far firmare al cliente.
// Il documento viene congelato in una versione immutabile: se i dati della
// prenotazione cambiano si crea una NUOVA revisione da accettare, senza riscrivere
// quella già firmata.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await ctx.params;

  const booking = await prisma.booking.findFirst({
    where: { id, tenantId: t.tenantId },
    include: {
      boat: { select: { nome: true, tipo: true, capienza: true, potenzaCv: true, patenteRichiesta: true } },
      skipper: { select: { nome: true } },
      tenant: { select: { nome: true, indirizzoPartenza: true, telefonoContatto: true, logoUrl: true } },
    },
  });
  if (!booking) return fail("Prenotazione non trovata", 404);
  if (booking.stato === "cancellata") return fail("Prenotazione annullata: nessun nuovo contratto", 422);
  if (booking.contrattoFirmatoAt) return fail("Contratto già firmato dal cliente", 422);

  const token = booking.contrattoToken ?? randomUUID().replace(/-/g, "");
  const adesso = new Date();
  const snapshot = snapshotNoleggio(
    {
      azienda: {
        nome: booking.tenant.nome,
        logo: booking.tenant.logoUrl,
        puntoPartenza: booking.tenant.indirizzoPartenza,
        telefono: booking.tenant.telefonoContatto,
      },
      cliente: booking.clienteNome,
      passeggeri: booking.passeggeri,
      inizioAt: booking.startAt,
      fineAt: booking.endAt,
      destinazione: booking.destinazione,
      formula: booking.formula,
      barca: {
        nome: booking.boat.nome,
        tipo: booking.boat.tipo,
        capienza: booking.boat.capienza,
        potenzaCv: booking.boat.potenzaCv,
        patenteRichiesta: booking.boat.patenteRichiesta,
      },
      skipper: booking.skipper?.nome ?? null,
      patenteOk: booking.patenteOk,
      prezzoCent: booking.prezzoCent,
      cauzioneCent: booking.cauzioneCent,
    },
    adesso
  );
  const hash = improntaContratto(snapshot);

  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");

  // Versione già congelata e invariata: si riusa il link senza riscrivere nulla.
  if (booking.contrattoSnapshot && booking.contrattoHash === hash) {
    return ok({ url: `${base}/contratto/${token}`, token, versione: booking.contrattoVersione, hash });
  }

  const versione = booking.contrattoSnapshot ? (booking.contrattoVersione ?? 1) + 1 : 1;
  const scritto = await prisma.booking.updateMany({
    where: { id: booking.id, tenantId: t.tenantId, contrattoFirmatoAt: null },
    data: {
      contrattoToken: token,
      contrattoSnapshot: snapshot,
      contrattoHash: hash,
      contrattoVersione: versione,
      contrattoCreatoAt: adesso,
    },
  });
  // Se nel frattempo è arrivata una firma, non si tocca il documento acquisito.
  if (scritto.count === 0) return fail("Contratto già firmato dal cliente", 422);

  return ok({ url: `${base}/contratto/${token}`, token, versione, hash });
}
