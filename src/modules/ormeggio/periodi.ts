import { aggiungiGiorni, giornoDi, inizioGiorno } from "@/modules/piattaforma/date";

export function dataSosta(value: string): Date | null {
  const soloGiorno = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!soloGiorno && !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const giorno = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(giorno.getTime()) || giorno.toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  const data = new Date(value);
  return Number.isNaN(data.getTime()) ? null : data;
}

export function inizioNuovaSosta(value: string, adesso = new Date()): Date | null {
  const data = dataSosta(value);
  if (!data) return null;
  return value === giornoDi(adesso) ? new Date(adesso) : data;
}

export function sovrapposizioneAssegnazioni(dal: Date, al: Date | null) {
  return {
    ...(al ? { dal: { lt: al } } : {}),
    OR: [{ al: null }, { al: { gt: dal } }],
  };
}

export function vistaGiornoSoste(value: string | null, adesso = new Date()) {
  const giorno = value ?? giornoDi(adesso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno) || !dataSosta(giorno)) return null;
  const inizio = inizioGiorno(giorno);
  const fine = inizioGiorno(aggiungiGiorni(giorno, 1));
  const oggi = giorno === giornoDi(adesso);
  return {
    inizio,
    fino: oggi ? adesso : new Date(fine.getTime() - 1),
    occupazione: oggi
      ? { dal: { lte: adesso }, OR: [{ al: null }, { al: { gt: adesso } }] }
      : sovrapposizioneAssegnazioni(inizio, fine),
  };
}

export function periodoOccupato(assegnazione: { dal: Date; al: Date | null }) {
  const formato = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return `dal ${formato.format(assegnazione.dal)} ${assegnazione.al ? `al ${formato.format(assegnazione.al)}` : "senza una fine prevista"}`;
}
