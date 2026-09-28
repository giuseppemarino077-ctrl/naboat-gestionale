import { prisma } from "@/lib/db";

// Servizi NaBoat in due aree separate ma comunicanti:
//  1) GESTIONALE  -> attivazione (una tantum) + canone di manutenzione/assistenza (mensile o stagionale)
//  2) MARKETPLACE -> fee percentuale SOLO sulle prenotazioni che arrivano dal canale NaBoat
// I soldi di attivazione e canone vanno tutti a NaBoat (account Stripe della piattaforma).
//
// MATRICE PRODOTTO → PREZZO → MODULO/CAPACITÀ → DECORRENZA/SCADENZA
//  • Attivazione              prezzoAttivazioneCent          gestionale   una tantum, non scade
//  • Manutenzione mensile     canoneMensileCent × mesi       gestionale   inizio → +N mesi (clamp)
//  • Manutenzione stagionale  canoneStagionaleCent × stagioni gestionale  inizio → +6 mesi/stagione (clamp)
//  • Piano Free               pianoFree* (limiti)            marketplace  nessun importo; limiti barche/foto
//  • Piano Pro                pianoProPrezzoMensileCent/AnnualeCent  marketplace  decorrenza pianoScadenzaAt
//  • Modulo Ormeggio          prezzoAttivazioneOrmeggioCent / canoneOrmeggioMensileCent  ormeggio  separato
// Il prezzo effettivo è listino di piattaforma (PlatformSettings) fuso con gli
// override dell'azienda (Tenant.*Cent): usa sempre listinoPerTenant.
// Un ordine in_attesa non dà diritti; solo il pagamento riuscito (stato attivo) li dà,
// una sola volta. I rinnovi si accodano alla scadenza corrente.

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

// Durata in mesi di calendario di una voce (0 per l'attivazione, che non scade).
export function durataMesi(tipo: Tipo, quantita: number): number {
  if (tipo === "manutenzione_stagionale") return MESI_PER_STAGIONE * quantita;
  if (tipo === "manutenzione_mensile") return quantita;
  return 0;
}

// Aggiunge mesi di calendario con clamp dell'ultimo giorno: 31 gennaio + 1 mese =
// 28/29 febbraio, non il 2/3 marzo. Così i rinnovi non saltano mesi né creano buchi.
export function aggiungiMesi(data: Date, mesi: number): Date {
  const d = new Date(data.getTime());
  const giorno = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + mesi);
  const ultimoGiorno = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(giorno, ultimoGiorno));
  return d;
}

export function preventivo(tipo: Tipo, quantita: number, l: Listino, da = new Date()) {
  const unitarioCent = prezzoUnitarioCent(tipo, l);
  const prezzoCent = unitarioCent * quantita;
  const inizioAt = new Date(da);
  const fineAt = tipo === "attivazione" ? new Date(da) : aggiungiMesi(da, durataMesi(tipo, quantita));
  return { prezzoCent, unitarioCent, inizioAt, fineAt };
}

// Manutenzione attiva = canone pagato (stato attivo), già iniziato e non scaduto.
// Il controllo su inizioAt evita che un rinnovo accodato dia diritti in anticipo.
export async function abbonamentoAttivo(tenantId: string) {
  const adesso = new Date();
  return prisma.subscription.findFirst({
    where: { tenantId, tipo: { startsWith: "manutenzione" }, stato: "attivo", inizioAt: { lte: adesso }, fineAt: { gt: adesso } },
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

// Come dataPartenza, ma serializzata per azienda: due rinnovi simultanei non
// partono dalla stessa scadenza (niente periodi sovrapposti). Il lock consultivo
// dura quanto la transazione e la lettura avviene dentro la transazione stessa.
export async function dataPartenzaSerializzata(tenantId: string, adesso = new Date()): Promise<Date> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rinnovo:${tenantId}`}))`;
    const attivo = await tx.subscription.findFirst({
      where: { tenantId, tipo: { startsWith: "manutenzione" }, stato: "attivo", inizioAt: { lte: adesso }, fineAt: { gt: adesso } },
      orderBy: { fineAt: "desc" },
    });
    return attivo && attivo.fineAt > adesso ? attivo.fineAt : adesso;
  });
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
