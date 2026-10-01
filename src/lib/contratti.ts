import crypto from "crypto";

// C01 — Versione immutabile del contratto.
// Alla generazione il documento viene congelato in uno snapshot (testo, dati,
// importi, condizioni) e legato alla firma da un'impronta sha256. La pagina
// pubblica rende solo lo snapshot; la firma è un aggiornamento condizionale sulla
// stessa versione. Non è una dichiarazione di validità legale: è una traccia.

// Condizioni del noleggio: entrano nella versione congelata. Cambiarle in futuro
// NON riscrive i contratti già generati (ne nasce una nuova revisione).
export const CONDIZIONI_NOLEGGIO = [
  "1. Il cliente dichiara di aver ricevuto l'imbarcazione in buono stato e di riconsegnarla nelle stesse condizioni, salvo normale usura.",
  "2. Il cliente si impegna a rispettare le norme di navigazione, la capienza massima e a non condurre l'imbarcazione in condizioni meteomarine sfavorevoli.",
  "3. I danni causati da uso improprio sono a carico del cliente; eventuali addebiti vengono trattenuti dalla cauzione.",
  "4. Il cliente restituisce l'imbarcazione nelle stesse condizioni in cui l'ha ricevuta.",
  "5. L'uscita può essere annullata per motivi di sicurezza o condizioni meteo sfavorevoli.",
];

// Serializzazione stabile: le chiavi sono ordinate, così la stessa versione ha
// sempre la stessa impronta, indipendentemente dall'ordine di costruzione.
export function canonico(valore: unknown): string {
  if (valore === null || typeof valore !== "object") return JSON.stringify(valore) ?? "null";
  if (Array.isArray(valore)) return `[${valore.map(canonico).join(",")}]`;
  const obj = valore as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonico(obj[k])}`).join(",")}}`;
}

// L'impronta copre i contenuti mostrati. La data di generazione è metadato e viene
// esclusa, così rigenerare la stessa versione non produce impronte diverse.
export function improntaContratto(snapshot: unknown): string {
  const contenuto = { ...((snapshot ?? {}) as Record<string, unknown>) };
  delete contenuto.generatoAt;
  return crypto.createHash("sha256").update(canonico(contenuto)).digest("hex");
}

// IP della richiesta: usato come evidenza della firma (come già nel progetto).
export function ipRichiesta(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "non rilevato"
  );
}

// --- Noleggio ---------------------------------------------------------------

export type SnapshotNoleggio = {
  schema: "noleggio/v1";
  generatoAt: string;
  azienda: { nome: string; logo: string | null; puntoPartenza: string | null; telefono: string | null };
  cliente: string | null;
  passeggeri: number;
  periodo: { inizioAt: string; fineAt: string };
  destinazione: string | null;
  formula: string | null;
  barca: { nome: string; tipo: string | null; capienza: number | null; potenzaCv: number | null; patenteRichiesta: boolean };
  skipper: string | null;
  patenteOk: boolean;
  importi: { prezzoCent: number | null; cauzioneCent: number | null };
  condizioni: string[];
};

export function snapshotNoleggio(
  dati: {
    azienda: { nome: string; logo: string | null; puntoPartenza: string | null; telefono: string | null };
    cliente: string | null;
    passeggeri: number;
    inizioAt: Date;
    fineAt: Date;
    destinazione: string | null;
    formula: string | null;
    barca: { nome: string; tipo: string | null; capienza: number | null; potenzaCv: number | null; patenteRichiesta: boolean };
    skipper: string | null;
    patenteOk: boolean;
    prezzoCent: number | null;
    cauzioneCent: number | null;
  },
  adesso: Date = new Date()
): SnapshotNoleggio {
  return {
    schema: "noleggio/v1",
    generatoAt: adesso.toISOString(),
    azienda: dati.azienda,
    cliente: dati.cliente,
    passeggeri: dati.passeggeri,
    periodo: { inizioAt: dati.inizioAt.toISOString(), fineAt: dati.fineAt.toISOString() },
    destinazione: dati.destinazione,
    formula: dati.formula,
    barca: dati.barca,
    skipper: dati.skipper,
    patenteOk: dati.patenteOk,
    importi: { prezzoCent: dati.prezzoCent, cauzioneCent: dati.cauzioneCent },
    condizioni: CONDIZIONI_NOLEGGIO,
  };
}

// --- Ormeggio ---------------------------------------------------------------

export type SnapshotOrmeggio = {
  schema: "ormeggio/v1";
  generatoAt: string;
  azienda: { nome: string; logo: string | null; telefono: string | null; indirizzo: string | null };
  tipo: string;
  proprietario: { nome: string; telefono: string | null; email: string | null };
  barca: { nome: string; tipo: string | null };
  posto: string;
  area: string | null;
  inizioAt: string;
  finePrevistaAt: string | null;
  corrispettivoCent: number | null;
  servizi: { tipo: string; quantita: number | null; unita: string | null; prezzoCent: number | null }[];
};

export function snapshotOrmeggio(
  dati: {
    azienda: { nome: string; logo: string | null; telefono: string | null; indirizzo: string | null };
    tipo: string;
    proprietario: { nome: string; telefono: string | null; email: string | null };
    barca: { nome: string; tipo: string | null };
    posto: string;
    area: string | null;
    inizioAt: Date;
    finePrevistaAt: Date | null;
    corrispettivoCent: number | null;
    servizi: { tipo: string; quantita: number | null; unita: string | null; prezzoCent: number | null }[];
  },
  adesso: Date = new Date()
): SnapshotOrmeggio {
  return {
    schema: "ormeggio/v1",
    generatoAt: adesso.toISOString(),
    azienda: dati.azienda,
    tipo: dati.tipo,
    proprietario: dati.proprietario,
    barca: dati.barca,
    posto: dati.posto,
    area: dati.area,
    inizioAt: dati.inizioAt.toISOString(),
    finePrevistaAt: dati.finePrevistaAt ? dati.finePrevistaAt.toISOString() : null,
    corrispettivoCent: dati.corrispettivoCent,
    servizi: dati.servizi,
  };
}
