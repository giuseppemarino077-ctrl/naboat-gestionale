import type { CategoriaSaldo, RigaDettaglioStatistica, StatisticaCalcolata, TipoDettaglioStatistica } from "./calcoli";

export type FiltriStatistiche = { dal: string; al: string; areaId: string; tipo: string };
export type DashboardStatistiche = Omit<StatisticaCalcolata, "dettagli" | "composizione"> & {
  aggiornatoAt: string; situazioneContiAt: string; baseCapacita: string; areaIdEffettiva: string;
  areeFiltro: { id: string; nome: string }[];
  confronto: Record<"precedente" | "anno", { periodo: { dal: string; al: string }; metriche: StatisticaCalcolata["metriche"] }>;
};
export type SelezioneStatistica = { tipo: TipoDettaglioStatistica | CategoriaSaldo; dal?: string; al?: string };
export type RigaDettaglio = Omit<RigaDettaglioStatistica, "data" | "inizioAt" | "fineAt"> & { data?: string; inizioAt?: string; fineAt?: string | null };
export type DettaglioStatistica = {
  totale: number; pagina: number; perPagina: number; righe: RigaDettaglio[];
  metriche: StatisticaCalcolata["metriche"]; copertura: StatisticaCalcolata["copertura"];
};
export const euro = (v: number | null | undefined) => v == null ? "—" : (v / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
export const numero = (v: number | null | undefined, digits = 1) => v == null ? "—" : v.toLocaleString("it-IT", { maximumFractionDigits: digits });
export const data = (s: string) => new Date(s.length === 10 ? `${s}T12:00:00Z` : s).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Rome" });
export const nomiSaldi: Record<CategoriaSaldo, string> = { saldati: "Saldati", parziali: "Parzialmente saldati", da_saldare: "Da saldare" };
export const titoliDettagli = { ...nomiSaldi, incassi: "Incassi netti", residui: "Da incassare", occupazione: "Occupazione posti", contratti: "Contratti iniziati" };
export const coloriSaldi: Record<CategoriaSaldo, string> = { saldati: "#087f8c", parziali: "#e8b24d", da_saldare: "#ed836b" };
export function queryStatistiche(f: FiltriStatistiche) {
  const p = new URLSearchParams({ dal: f.dal, al: f.al });
  if (f.areaId) p.set("areaId", f.areaId);
  if (f.tipo) p.set("tipo", f.tipo);
  return p;
}
