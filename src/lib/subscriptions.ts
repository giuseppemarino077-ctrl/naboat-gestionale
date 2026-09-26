import { prisma } from "@/lib/db";

// Servizi NaBoat in due aree separate ma comunicanti:
//  1) GESTIONALE  -> attivazione (una tantum) + canone di manutenzione/assistenza (mensile o stagionale)
//  2) MARKETPLACE -> fee percentuale SOLO sulle prenotazioni che arrivano dal canale NaBoat
// I soldi di attivazione e canone vanno tutti a NaBoat (account Stripe della piattaforma).

export const TIPI = ["attivazione", "manutenzione_mensile", "manutenzione_stagionale"] as const;
export type Tipo = (typeof TIPI)[number];

// Una stagione vale 6 mesi (stagione nautica), modificabile qui se serve.
export const MESI_PER_STAGIONE = 6;

export type Listino = {
  prezzoAttivazioneCent: number;
  canoneMensileCent: number;
  canoneStagionaleCent: number;
  // Modulo Ormeggio: prodotto separato, con il suo listino (null = non ancora impostato).
  prezzoAttivazioneOrmeggioCent: number | null;
  canoneOrmeggioMensileCent: number | null;
  feeNaboatPctDefault: number;
  abbonamentoObbligatorio: boolean;
};

export function etichetta(tipo: string, quantita = 1): string {
  if (tipo === "attivazione") return "Attivazione e installazione";
  if (tipo === "manutenzione_stagionale") return quantita === 1 ? "Manutenzione stagionale (1 stagione)" : `Manutenzione stagionale (${quantita} stagioni)`;
  return quantita === 1 ? "Manutenzione mensile (1 mese)" : `Manutenzione mensile (${quantita} mesi)`;
}

// Listino di piattaforma (riga singola). Se manca, viene creata con valori a zero.
export async function listino(): Promise<Listino> {
  const s = await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
    select: {
      prezzoAttivazioneCent: true,
      canoneMensileCent: true,
      canoneStagionaleCent: true,
      prezzoAttivazioneOrmeggioCent: true,
      canoneOrmeggioMensileCent: true,
      feeNaboatPctDefault: true,
      abbonamentoObbligatorio: true,
    },
  });
  return s;
}

// Listino effettivo per un'azienda: il listino di piattaforma, con gli eventuali accordi personalizzati.
export async function listinoPerTenant(tenantId: string): Promise<Listino> {
  const [base, t] = await Promise.all([
    listino(),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { prezzoAttivazioneCent: true, canoneMensileCent: true, canoneStagionaleCent: true, feeNaboatPct: true },
    }),
  ]);
  if (!t) return base;
  return {
    ...base,
    prezzoAttivazioneCent: t.prezzoAttivazioneCent ?? base.prezzoAttivazioneCent,
    canoneMensileCent: t.canoneMensileCent ?? base.canoneMensileCent,
    canoneStagionaleCent: t.canoneStagionaleCent ?? base.canoneStagionaleCent,
    feeNaboatPctDefault: t.feeNaboatPct > 0 ? t.feeNaboatPct : base.feeNaboatPctDefault,
  };
}

export function prezzoUnitarioCent(tipo: Tipo, l: Listino): number {
  if (tipo === "attivazione") return l.prezzoAttivazioneCent;
  if (tipo === "manutenzione_stagionale") return l.canoneStagionaleCent;
  return l.canoneMensileCent;
}

// Quantità ammesse: attivazione 1, manutenzione mensile 1–24, stagionale 1–10.
export function quantitaAmmessa(tipo: Tipo, quantita: number): boolean {
  if (!Number.isInteger(quantita)) return false;
  if (tipo === "attivazione") return quantita === 1;
  if (tipo === "manutenzione_stagionale") return quantita >= 1 && quantita <= 10;
  return quantita >= 1 && quantita <= 24;
}

export function preventivo(tipo: Tipo, quantita: number, l: Listino, da = new Date()) {
  const unitarioCent = prezzoUnitarioCent(tipo, l);
  const prezzoCent = unitarioCent * quantita;
  const inizioAt = new Date(da);
  const fineAt = new Date(da);
  if (tipo === "attivazione") {
    fineAt.setTime(inizioAt.getTime());
  } else if (tipo === "manutenzione_stagionale") {
    fineAt.setUTCMonth(fineAt.getUTCMonth() + MESI_PER_STAGIONE * quantita);
  } else {
    fineAt.setUTCMonth(fineAt.getUTCMonth() + quantita);
  }
  return { prezzoCent, unitarioCent, inizioAt, fineAt };
}

// Manutenzione attiva = canone di manutenzione pagato e non ancora scaduto.
export async function abbonamentoAttivo(tenantId: string) {
  return prisma.subscription.findFirst({
    where: { tenantId, tipo: { startsWith: "manutenzione" }, stato: "attivo", fineAt: { gt: new Date() } },
    orderBy: { fineAt: "desc" },
  });
}

// Attivazione pagata (una tantum): non ha scadenza.
export async function attivazionePagata(tenantId: string) {
  return prisma.subscription.findFirst({
    where: { tenantId, tipo: "attivazione", stato: "attivo" },
    orderBy: { paidAt: "desc" },
  });
}

export async function statoAbbonamento(tenantId: string) {
  const [manutenzione, attivazione] = await Promise.all([abbonamentoAttivo(tenantId), attivazionePagata(tenantId)]);
  return { manutenzione, attivazione };
}

export function giorniResidui(fineAt: Date, adesso = new Date()): number {
  return Math.max(0, Math.ceil((fineAt.getTime() - adesso.getTime()) / 86400000));
}

// Quando parte un nuovo periodo: se c'è già una manutenzione attiva, si accoda alla sua scadenza.
export async function dataPartenza(tenantId: string, adesso = new Date()): Promise<Date> {
  const attivo = await abbonamentoAttivo(tenantId);
  return attivo && attivo.fineAt > adesso ? attivo.fineAt : adesso;
}

// Usata sui percorsi caldi (ogni richiesta delle API operative).
export async function abbonamentoRichiesto(): Promise<boolean> {
  const s = await prisma.platformSettings.findUnique({
    where: { id: "singleton" },
    select: { abbonamentoObbligatorio: true },
  });
  return s?.abbonamentoObbligatorio === true;
}

export async function marcaScaduti() {
  await prisma.subscription.updateMany({
    where: { stato: "attivo", tipo: { startsWith: "manutenzione" }, fineAt: { lt: new Date() } },
    data: { stato: "scaduto" },
  });
}
