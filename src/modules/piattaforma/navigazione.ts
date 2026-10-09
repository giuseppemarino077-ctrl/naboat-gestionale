import type { NomeIcona } from "@/components/ui/Icona";

export type Modulo = "noleggio" | "ormeggio" | "comune";
export type Gruppo = "noleggio" | "ormeggio" | "marketplace" | "gestione";
export type Voce = {
  href: string;
  icona: NomeIcona;
  nome: string;
  ruoli: string[];
  modulo: Modulo;
  gruppo: Gruppo;
  primaria: boolean;
};

export const AZIENDA = ["owner", "operatore"];
export const AZIENDA_E_SKIPPER = ["owner", "operatore", "skipper"];

export const VOCI_COMUNI: Voce[] = [
  { href: "/gestionale/registro", icona: "registro", nome: "Registro", ruoli: AZIENDA, modulo: "comune", gruppo: "gestione", primaria: false },
  { href: "/gestionale/impostazioni/piano", icona: "pacchetto", nome: "Servizi NaBoat", ruoli: ["owner"], modulo: "comune", gruppo: "gestione", primaria: false },
  { href: "/gestionale/impostazioni/team", icona: "utente", nome: "Team", ruoli: ["owner"], modulo: "comune", gruppo: "gestione", primaria: false },
  { href: "/gestionale/impostazioni", icona: "ingranaggio", nome: "Impostazioni", ruoli: AZIENDA, modulo: "comune", gruppo: "gestione", primaria: false },
  { href: "/gestionale/impostazioni/sicurezza", icona: "scudo", nome: "Sicurezza", ruoli: AZIENDA_E_SKIPPER, modulo: "comune", gruppo: "gestione", primaria: false },
];
