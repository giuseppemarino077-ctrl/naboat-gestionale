import type { Prisma } from "@prisma/client";

// Servizio unico per la disponibilità delle risorse (barca e skipper).
// Regole condivise da creazione/modifica prenotazione, blocchi e richieste dal sito:
// - una barca è occupata dalle prenotazioni in corso (da_confermare, prenotata, in_mare)
//   e dai blocchi, con in più il tempo di preparazione configurato (pulizia/rifornimento);
// - uno skipper non può avere due uscite sovrapposte.
// Il controllo va fatto dentro una transazione, dopo aver preso i lock sulle risorse.

export type Db = Prisma.TransactionClient;

// Stati che tengono occupata la barca.
export const STATI_OCCUPANTI = ["da_confermare", "prenotata", "in_mare"] as const;

export type EsitoDisponibilita =
  | { ok: true }
  | { ok: false; motivo: "barca" | "blocco" | "skipper"; messaggio: string };

// Lock consultivi per serializzare le scritture sulle stesse risorse.
// Le chiavi sono ordinate (ordine globale stabile): quando una prenotazione si sposta
// fra due barche i lock vengono presi sempre nello stesso ordine, così due spostamenti
// incrociati non si bloccano a vicenda (deadlock).
export async function bloccaRisorse(
  tx: Db,
  input: { boatIds?: (string | null | undefined)[]; skipperId?: string | null; chiaviExtra?: (string | null | undefined)[] }
): Promise<void> {
  const chiavi = new Set<string>();
  for (const b of input.boatIds ?? []) if (b) chiavi.add(`barca:${b}`);
  if (input.skipperId) chiavi.add(`skipper:${input.skipperId}`);
  for (const k of input.chiaviExtra ?? []) if (k) chiavi.add(k);
  for (const chiave of [...chiavi].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chiave}))`;
  }
}

// Tempo di preparazione (minuti -> millisecondi), letto dalle impostazioni NaBoat.
// Se le impostazioni non sono leggibili si procede senza margine.
export async function tempoPreparazioneMs(tx: Db): Promise<number> {
  const s = await tx.platformSettings
    .findUnique({ where: { id: "singleton" }, select: { tempoPreparazioneMin: true } })
    .catch(() => null);
  return Math.max(0, s?.tempoPreparazioneMin ?? 0) * 60000;
}

// Verifica se barca e skipper sono liberi nell'intervallo indicato.
// bookingId: la prenotazione in modifica, da escludere dal confronto (non confligge con sé stessa).
export async function verificaDisponibilita(
  tx: Db,
  input: { tenantId: string; boatId: string; startAt: Date; endAt: Date; bookingId?: string; skipperId?: string | null }
): Promise<EsitoDisponibilita> {
  const prepMs = await tempoPreparazioneMs(tx);
  const startAllargato = new Date(input.startAt.getTime() - prepMs);
  const endAllargato = new Date(input.endAt.getTime() + prepMs);
  const escludi = input.bookingId ? { id: { not: input.bookingId } } : {};

  // Sovrapposizione con un'altra prenotazione della stessa barca (margine di preparazione incluso).
  const sovrapposta = await tx.booking.findFirst({
    where: {
      tenantId: input.tenantId,
      boatId: input.boatId,
      ...escludi,
      stato: { in: [...STATI_OCCUPANTI] },
      startAt: { lt: endAllargato },
      endAt: { gt: startAllargato },
    },
    select: { id: true },
  });
  if (sovrapposta) {
    return {
      ok: false,
      motivo: "barca",
      messaggio:
        prepMs > 0
          ? "Sovrapposizione con altra prenotazione (o troppo vicina: serve il tempo di preparazione)"
          : "Sovrapposizione con altra prenotazione",
    };
  }

  const blocco = await tx.block.findFirst({
    where: { tenantId: input.tenantId, boatId: input.boatId, startAt: { lt: endAllargato }, endAt: { gt: startAllargato } },
    select: { id: true, motivo: true },
  });
  if (blocco) return { ok: false, motivo: "blocco", messaggio: `Risorsa bloccata${blocco.motivo ? `: ${blocco.motivo}` : ""}` };

  // Lo skipper non può trovarsi su due uscite sovrapposte.
  if (input.skipperId) {
    const skipperImpegnato = await tx.booking.findFirst({
      where: {
        tenantId: input.tenantId,
        skipperId: input.skipperId,
        ...escludi,
        stato: { in: [...STATI_OCCUPANTI] },
        startAt: { lt: input.endAt },
        endAt: { gt: input.startAt },
      },
      select: { id: true },
    });
    if (skipperImpegnato) return { ok: false, motivo: "skipper", messaggio: "Skipper già impegnato in un'altra uscita" };
  }

  return { ok: true };
}

// --- Validazione dello stato finale (stesse regole in creazione, modifica e richieste) ---

// Barca utilizzabile per il noleggio e capienza sufficiente.
// La scadenza manutentiva informativa non blocca: solo lo stato "manutenzione" ferma la barca.
export function validaBarcaNoleggio(
  boat: { uso: string; archiviato: boolean; stato: string; capienza: number },
  passeggeri: number
): string | null {
  if (boat.uso !== "noleggio") return "La barca non è destinata al noleggio";
  if (boat.archiviato) return "Barca archiviata";
  if (boat.stato === "manutenzione") return "Barca in manutenzione";
  if (passeggeri > boat.capienza) return `Capienza max ${boat.capienza}`;
  return null;
}

// L'obbligo di patente dipende solo dal campo configurato, mai dalla potenza del motore.
export function validaPatente(
  boat: { patenteRichiesta: boolean },
  dati: { patenteOk: boolean; skipperId?: string | null }
): string | null {
  if (boat.patenteRichiesta && !dati.patenteOk && !dati.skipperId) return "Patente richiesta: indicare patente oppure skipper";
  return null;
}
