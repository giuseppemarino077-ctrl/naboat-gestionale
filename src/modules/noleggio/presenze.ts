import { prisma } from "@/lib/db";

// Check-in alla partenza e check-out al rientro: condivisi dalle due rotte.
// La rilevazione del carburante non fa più parte del flusso attivo: i campi storici
// (checkinCarburantePct/checkoutCarburantePct) restano nel database in sola lettura
// per i verbali già registrati, ma non vengono più richiesti né scritti.
export type DatiPresenza = {
  note?: string | null;
  danniEuro?: string | null;
};

type Esito = { ok: true; booking: unknown; idempotente?: boolean } | { ok: false; errore: string; stato: number };

// Unica fonte della verità per la macchina a stati della prenotazione.
export const STATI_PRENOTAZIONE = ["da_confermare", "prenotata", "in_mare", "rientrata", "no_show", "cancellata"] as const;
export type StatoPrenotazione = (typeof STATI_PRENOTAZIONE)[number];

// Transizioni ammesse: da_confermare -> prenotata | cancellata ;
// prenotata -> in_mare | no_show | cancellata ; in_mare -> rientrata | cancellata.
export const TRANSIZIONI: Record<StatoPrenotazione, StatoPrenotazione[]> = {
  da_confermare: ["prenotata", "cancellata"],
  prenotata: ["in_mare", "no_show", "cancellata"],
  in_mare: ["rientrata", "cancellata"],
  rientrata: [],
  no_show: [],
  cancellata: [],
};

export function transizioneConsentita(da: string, a: string): boolean {
  return (TRANSIZIONI[da as StatoPrenotazione] ?? []).includes(a as StatoPrenotazione);
}

// Stati conclusi o annullati: da qui non si torna indietro né si registra altro.
export function statoBloccato(stato: string): boolean {
  return stato === "rientrata" || stato === "no_show" || stato === "cancellata";
}

// Check-in: scrive i dati di presenza e porta lo stato a "in_mare" nella stessa
// transazione. Il lock per prenotazione e il controllo di checkinAt rendono i retry
// idempotenti: nessun doppio effetto e nessun evento di storico duplicato.
export async function registraCheckin(tenantId: string, userId: string, bookingId: string, dati: DatiPresenza): Promise<Esito> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`presenza:${bookingId}`}))`;

    const booking = await tx.booking.findFirst({ where: { id: bookingId, tenantId } });
    if (!booking) return { ok: false, errore: "Prenotazione non trovata", stato: 404 };

    // Già registrato: si restituisce l'esito senza nuovi effetti né eventi.
    if (booking.checkinAt) return { ok: true, booking, idempotente: true };

    if (booking.stato === "cancellata") return { ok: false, errore: "Prenotazione annullata: check-in non consentito", stato: 409 };
    if (statoBloccato(booking.stato)) return { ok: false, errore: `Prenotazione ${booking.stato}: check-in non consentito`, stato: 409 };
    // Si parte da "prenotata". Se lo stato è già "in_mare" si completa solo la presenza.
    if (booking.stato !== "prenotata" && booking.stato !== "in_mare") {
      return { ok: false, errore: "Conferma la prenotazione prima del check-in", stato: 422 };
    }

    const avanzamento = booking.stato === "prenotata";
    const upd = await tx.booking.update({
      where: { id: booking.id },
      data: {
        checkinAt: new Date(),
        checkinNote: dati.note ?? null,
        // Check-in e partenza sono la stessa azione: lo stato avanza atomicamente.
        ...(avanzamento ? { stato: "in_mare" as const } : {}),
      },
    });

    // Un solo evento di audit, scritto qui: le rotte non ne aggiungono altri.
    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        azione: "booking.checkin",
        entita: "Booking",
        entitaId: booking.id,
        dettagli: JSON.stringify({ nota: avanzamento ? `${booking.stato} → in_mare` : `stato già ${booking.stato}` }),
      },
    });
    return { ok: true, booking: upd };
  });
}

// Check-out: chiude il ciclo portando lo stato a "rientrata" (abilita le recensioni).
// Anche qui il lock e il controllo di checkoutAt rendono i retry idempotenti.
export async function registraCheckout(tenantId: string, userId: string, bookingId: string, dati: DatiPresenza): Promise<Esito> {
  let danniCent: number | null = null;
  if (dati.danniEuro) {
    const n = Math.round(Number(String(dati.danniEuro).replace(",", ".")) * 100);
    if (!Number.isFinite(n) || n < 0) return { ok: false, errore: "Importo danni non valido", stato: 422 };
    danniCent = n;
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`presenza:${bookingId}`}))`;

    const booking = await tx.booking.findFirst({ where: { id: bookingId, tenantId } });
    if (!booking) return { ok: false, errore: "Prenotazione non trovata", stato: 404 };

    // Già chiuso: retry idempotente, nessun nuovo effetto né evento.
    if (booking.checkoutAt) return { ok: true, booking, idempotente: true };

    if (booking.stato === "cancellata") return { ok: false, errore: "Prenotazione annullata: check-out non consentito", stato: 409 };
    if (!booking.checkinAt) return { ok: false, errore: "Prima registra il check-in", stato: 422 };
    // Uscita già conclusa (rientrata/no_show) senza checkoutAt: retry idempotente.
    if (statoBloccato(booking.stato)) return { ok: true, booking, idempotente: true };

    const upd = await tx.booking.update({
      where: { id: booking.id },
      data: {
        checkoutAt: new Date(),
        checkoutNote: dati.note ?? null,
        danniCent,
        stato: "rientrata",
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId,
        actorId: userId,
        azione: "booking.checkout",
        entita: "Booking",
        entitaId: booking.id,
        dettagli: JSON.stringify({ nota: `${booking.stato} → rientrata` }),
      },
    });
    return { ok: true, booking: upd };
  });
}
