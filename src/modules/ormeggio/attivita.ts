export type StatoAttivita = "da_fare" | "in_corso" | "completato";
export type OrdineAttivita = "giorno" | "priorita";

export type AttivitaOperativa = {
  id: string;
  revisione?: number;
  tipo: string;
  priorita: number;
  note: string | null;
  contabilizzata: boolean;
  addebito: { id: string; stato: string; pagamentoPresente?: boolean } | null;
  stato: StatoAttivita;
  dataPrevista: string | null;
  permanenzaId: string;
  addetto: { id: string; nome: string | null } | null;
  daAddebitare: boolean;
  permanenza: {
    boat: { nome: string; proprietario: { nome: string } | null };
    posto: { codice: string } | null;
  };
};

export const STATI_ATTIVITA = [
  { valore: "da_fare", nome: "Da fare", badge: "badge-block", bordo: "border-t-coral", fondo: "bg-danger-soft/60" },
  { valore: "in_corso", nome: "In corso", badge: "badge-pending", bordo: "border-t-gold", fondo: "bg-warn-soft/70" },
  { valore: "completato", nome: "Completato", badge: "badge-ready", bordo: "border-t-sea", fondo: "bg-ok-soft/80" },
] as const;

export function attivitaInRitardo(a: AttivitaOperativa, oggi: string) {
  return a.stato !== "completato" && !!a.dataPrevista && a.dataPrevista.slice(0, 10) < oggi;
}

export function ordinaAttivita(attivita: AttivitaOperativa[], ordine: OrdineAttivita) {
  const perData = (a: AttivitaOperativa, b: AttivitaOperativa) => (a.dataPrevista?.slice(0, 10) ?? "9999").localeCompare(b.dataPrevista?.slice(0, 10) ?? "9999");
  return [...attivita].sort((a, b) => ordine === "giorno"
    ? perData(a, b) || Number(a.stato === "completato") - Number(b.stato === "completato") || b.priorita - a.priorita
    : b.priorita - a.priorita || perData(a, b) || Number(a.stato === "completato") - Number(b.stato === "completato"));
}

export function puoCambiareStato(a: AttivitaOperativa, stato: StatoAttivita, vedeImporti: boolean) {
  if (a.stato === stato) return false;
  if (a.stato === "completato" && a.contabilizzata && (!vedeImporti || a.addebito?.stato === "pagato" || a.addebito?.pagamentoPresente)) return false;
  return stato !== "completato" || vedeImporti || !a.daAddebitare;
}
