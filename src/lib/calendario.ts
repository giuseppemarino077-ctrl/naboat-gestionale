// Utility unica per le date del calendario.
//
// Convenzione degli intervalli: un impegno (prenotazione o blocco) vale su
// [inizio, fine) — l'inizio è compreso, la fine è esclusa. Inizio e fine sono
// istanti UTC (ISO) nelle API; la sovrapposizione è `aStart < bEnd && aEnd > bStart`.
//
// I giorni sono stringhe "YYYY-MM-DD" nel fuso dell'attività (Europe/Rome): non
// dipendono dal fuso del browser né dall'ora del server. Le conversioni tra ora
// civile di Roma e istante UTC usano IANA (Intl), quindi l'ora legale è gestita
// senza offset fissi ±1h/±2h. Le API continuano a scambiare solo istanti UTC ISO.

export const FUSO = "Europe/Rome";
export type Giorno = string;

const pad = (n: number) => String(n).padStart(2, "0");

// Campi dell'ora civile di Roma per un istante.
function partiRoma(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(d)) p[type] = value;
  return { anno: +p.year, mese: +p.month, giorno: +p.day, ora: +p.hour, minuto: +p.minute, secondo: +p.second };
}

// Scostamento di Roma dall'UTC (ms) nell'istante dato: +1h o +2h secondo l'ora legale.
function offsetRoma(d: Date): number {
  const p = partiRoma(d);
  const comeUTC = Date.UTC(p.anno, p.mese - 1, p.giorno, p.ora, p.minuto, p.secondo);
  return comeUTC - (d.getTime() - d.getMilliseconds());
}

// Giorno civile di Roma per un istante UTC.
export function giornoDi(iso: string | Date): Giorno {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = partiRoma(d);
  return `${p.anno}-${pad(p.mese)}-${pad(p.giorno)}`;
}

// Ora civile di Roma per un istante UTC, "HH:MM".
export function oreDi(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = partiRoma(d);
  return `${pad(p.ora)}:${pad(p.minuto)}`;
}

// Istante UTC corrispondente a un'ora civile di Roma. Il doppio passaggio gestisce
// i cambi d'ora: l'offset dipende dall'istante, non da un valore fisso.
export function istante(g: Giorno, ora: string): Date {
  const [y, m, d] = g.split("-").map(Number);
  const [hh, mm] = (ora || "00:00").split(":").map(Number);
  const civ = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  const off = offsetRoma(new Date(civ));
  let t = civ - off;
  const off2 = offsetRoma(new Date(t));
  if (off2 !== off) t = civ - off2;
  return new Date(t);
}

// Ogni giorno è [inizio, fine): "fine" è l'ultimo istante del giorno (23:59:59.999).
export function inizioGiorno(g: Giorno): Date {
  return istante(g, "00:00");
}
export function fineGiorno(g: Giorno): Date {
  return new Date(inizioGiorno(aggiungiGiorni(g, 1)).getTime() - 1);
}

export function oggi(): Giorno {
  return giornoDi(new Date());
}

// --- Aritmetica sui giorni (stringhe), indipendente dal fuso ---
function dataUTC(g: Giorno): Date {
  const [y, m, d] = g.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}
function daDataUTC(d: Date): Giorno {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function aggiungiGiorni(g: Giorno, n: number): Giorno {
  const d = dataUTC(g);
  d.setUTCDate(d.getUTCDate() + n);
  return daDataUTC(d);
}

// Lunedì della settimana che contiene il giorno.
export function lunediDi(g: Giorno): Giorno {
  return aggiungiGiorni(g, -((dataUTC(g).getUTCDay() + 6) % 7));
}

export function giorniTra(from: Giorno, to: Giorno): Giorno[] {
  const out: Giorno[] = [];
  let g = from;
  let guard = 0;
  while (g <= to && guard < 400) {
    out.push(g);
    g = aggiungiGiorni(g, 1);
    guard++;
  }
  return out;
}

// Sovrapposizione tra due intervalli [aStart,aEnd) e [bStart,bEnd).
export function sovrappone(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

// Data locale usata solo per etichette e aritmetica di calendario (mai per istanti).
export function aData(g: Giorno): Date {
  const [y, m, d] = g.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

export function daData(d: Date): Giorno {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const GIORNI_BREVI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

export function etichettaGiorno(g: Giorno, opzioni?: Intl.DateTimeFormatOptions): string {
  return aData(g).toLocaleDateString("it-IT", opzioni ?? { weekday: "short", day: "numeric", month: "short" });
}
