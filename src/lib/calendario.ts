// Utility unica per le date del calendario.
// Regola: i giorni sono stringhe "YYYY-MM-DD" nel fuso locale del browser; i momenti
// (inizio/fine di una prenotazione o di un blocco) sono oggetti Date locali convertiti
// in ISO solo per l'API. Confronti e giorni si fanno SEMPRE in locale, mai con toISOString.

const pad = (n: number) => String(n).padStart(2, "0");

export type Giorno = string; // "YYYY-MM-DD"

export function daData(d: Date): Giorno {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function oggi(): Giorno {
  return daData(new Date());
}

export function aData(g: Giorno): Date {
  const [y, m, d] = g.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

// Giorno locale di un istante ISO (es. "2026-09-28T22:00:00.000Z").
export function giornoDi(iso: string): Giorno {
  return daData(new Date(iso));
}

export function oreDi(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function istante(g: Giorno, ora: string): Date {
  const [y, m, d] = g.split("-").map(Number);
  const [hh, mm] = (ora || "00:00").split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

export function inizioGiorno(g: Giorno): Date {
  return istante(g, "00:00");
}
export function fineGiorno(g: Giorno): Date {
  const d = istante(g, "00:00");
  d.setHours(23, 59, 59, 999);
  return d;
}

export function aggiungiGiorni(g: Giorno, n: number): Giorno {
  const d = aData(g);
  d.setDate(d.getDate() + n);
  return daData(d);
}

// Lunedì della settimana che contiene il giorno.
export function lunediDi(g: Giorno): Giorno {
  const d = aData(g);
  return aggiungiGiorni(g, -((d.getDay() + 6) % 7));
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

export const GIORNI_BREVI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];

export function etichettaGiorno(g: Giorno, opzioni?: Intl.DateTimeFormatOptions): string {
  return aData(g).toLocaleDateString("it-IT", opzioni ?? { weekday: "short", day: "numeric", month: "short" });
}
