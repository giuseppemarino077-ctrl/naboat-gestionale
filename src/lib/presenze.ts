import { prisma } from "@/lib/db";

// Check-in alla partenza e check-out al rientro: condivisi dalle due rotte.
export type DatiPresenza = {
  carburantePct?: number | null;
  note?: string | null;
  danniEuro?: string | null;
};

type Esito = { ok: true; booking: unknown } | { ok: false; errore: string; stato: number };

export async function registraCheckin(tenantId: string, userId: string, bookingId: string, dati: DatiPresenza): Promise<Esito> {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, tenantId } });
  if (!booking) return { ok: false, errore: "Prenotazione non trovata", stato: 404 };
  if (booking.checkinAt) return { ok: false, errore: "Check-in già registrato", stato: 422 };

  const upd = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      checkinAt: new Date(),
      checkinNote: dati.note ?? null,
      checkinCarburantePct: dati.carburantePct ?? null,
    },
  });
  await prisma.auditLog.create({
    data: { tenantId, actorId: userId, azione: "booking.checkin", entita: "Booking", entitaId: booking.id },
  });
  return { ok: true, booking: upd };
}

export async function registraCheckout(tenantId: string, userId: string, bookingId: string, dati: DatiPresenza): Promise<Esito> {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, tenantId } });
  if (!booking) return { ok: false, errore: "Prenotazione non trovata", stato: 404 };
  if (!booking.checkinAt) return { ok: false, errore: "Prima registra il check-in", stato: 422 };
  if (booking.checkoutAt) return { ok: false, errore: "Check-out già registrato", stato: 422 };

  let danniCent: number | null = null;
  if (dati.danniEuro) {
    const n = Math.round(Number(String(dati.danniEuro).replace(",", ".")) * 100);
    if (!Number.isFinite(n) || n < 0) return { ok: false, errore: "Importo danni non valido", stato: 422 };
    danniCent = n;
  }

  const upd = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      checkoutAt: new Date(),
      checkoutNote: dati.note ?? null,
      checkoutCarburantePct: dati.carburantePct ?? null,
      danniCent,
    },
  });
  await prisma.auditLog.create({
    data: { tenantId, actorId: userId, azione: "booking.checkout", entita: "Booking", entitaId: booking.id },
  });
  return { ok: true, booking: upd };
}
