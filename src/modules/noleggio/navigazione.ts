import { AZIENDA, AZIENDA_E_SKIPPER, type Voce } from "@/modules/piattaforma/navigazione";

export const VOCI_NOLEGGIO: Voce[] = [
  { href: "/gestionale/oggi", icona: "casa", nome: "Oggi", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio", gruppo: "noleggio", primaria: true },
  { href: "/gestionale/calendario", icona: "calendario", nome: "Calendario", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio", gruppo: "noleggio", primaria: true },
  { href: "/gestionale/prenotazioni", icona: "lista", nome: "Prenotazioni", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio", primaria: true },
  { href: "/gestionale/flotta", icona: "barca", nome: "Flotta", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio", primaria: true },
  { href: "/gestionale/esperienze", icona: "etichetta", nome: "Esperienze", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio", primaria: true },
  { href: "/gestionale/clienti", icona: "clienti", nome: "Clienti", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio", primaria: true },
  { href: "/gestionale/economia", icona: "euro", nome: "Economia", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio", primaria: true },
  { href: "/gestionale/skipper", icona: "orologio", nome: "Skipper", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio", gruppo: "noleggio", primaria: true },
  { href: "/gestionale/meteo", icona: "meteo", nome: "Meteo", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio", gruppo: "noleggio", primaria: false },
  { href: "/gestionale/manutenzione", icona: "manutenzione", nome: "Manutenzione", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio", primaria: false },
  { href: "/gestionale/marketplace", icona: "occhio", nome: "Presenza e richieste", ruoli: AZIENDA, modulo: "noleggio", gruppo: "marketplace", primaria: true },
  { href: "/gestionale/recensioni", icona: "stella", nome: "Recensioni", ruoli: AZIENDA, modulo: "noleggio", gruppo: "marketplace", primaria: true },
  { href: "/gestionale/impostazioni/porti", icona: "pin", nome: "Porti", ruoli: AZIENDA, modulo: "noleggio", gruppo: "marketplace", primaria: false },
  { href: "/gestionale/impostazioni/listino", icona: "etichetta", nome: "Listino", ruoli: AZIENDA, modulo: "noleggio", gruppo: "marketplace", primaria: false },
];
