import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { condizioniDaTesto, improntaContratto, snapshotNoleggio } from "@/lib/contratti";

export type EsitoLinkContratto =
  | { ok: true; url: string; token: string; versione: number | null; hash: string }
  | { ok: false; status: number; error: string };

// Genera (o restituisce) il link di firma del contratto di noleggio. Il documento
// è congelato in una versione immutabile: se i dati (o il testo personalizzato)
// cambiano nasce una NUOVA revisione, senza riscrivere quella già firmata.
export async function generaLinkContratto(
  tenantId: string,
  bookingId: string,
  base: string
): Promise<EsitoLinkContratto> {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, tenantId },
    include: {
      boat: { select: { nome: true, tipo: true, capienza: true, potenzaCv: true, patenteRichiesta: true } },
      skipper: { select: { nome: true } },
      tenant: { select: { nome: true, indirizzoPartenza: true, telefonoContatto: true, logoUrl: true } },
    },
  });
  if (!booking) return { ok: false, status: 404, error: "Prenotazione non trovata" };
  if (booking.stato === "cancellata") return { ok: false, status: 422, error: "Prenotazione annullata: nessun nuovo contratto" };
  if (booking.contrattoFirmatoAt) return { ok: false, status: 422, error: "Contratto già firmato dal cliente" };

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
      condizioni: condizioniDaTesto(booking.contrattoTesto),
    },
    adesso
  );
  const hash = improntaContratto(snapshot);
  const url = `${base}/contratto/${token}`;

  // Versione già congelata e invariata: si riusa il link senza riscrivere nulla.
  if (booking.contrattoSnapshot && booking.contrattoHash === hash) {
    return { ok: true, url, token, versione: booking.contrattoVersione, hash };
  }

  const versione = booking.contrattoSnapshot ? (booking.contrattoVersione ?? 1) + 1 : 1;
  const scritto = await prisma.booking.updateMany({
    where: { id: booking.id, tenantId, contrattoFirmatoAt: null },
    data: {
      contrattoToken: token,
      contrattoSnapshot: snapshot,
      contrattoHash: hash,
      contrattoVersione: versione,
      contrattoCreatoAt: adesso,
    },
  });
  if (scritto.count === 0) return { ok: false, status: 422, error: "Contratto già firmato dal cliente" };

  return { ok: true, url, token, versione, hash };
}
