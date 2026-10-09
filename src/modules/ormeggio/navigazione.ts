import { AZIENDA, type Voce } from "@/modules/piattaforma/navigazione";

export const VOCI_ORMEGGIO: Voce[] = [
  { href: "/gestionale/ormeggio", icona: "moduli", nome: "Quadro posti", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio", primaria: true },
  { href: "/gestionale/ormeggio/da-fare", icona: "checklist", nome: "Attività", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio", primaria: true },
  { href: "/gestionale/ormeggio/movimenti", icona: "movimenti", nome: "Movimenti", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio", primaria: true },
  { href: "/gestionale/ormeggio/proprietari", icona: "utente", nome: "Proprietari", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio", primaria: true },
  { href: "/gestionale/ormeggio/conti", icona: "portafoglio", nome: "Economia", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio", primaria: true },
  { href: "/gestionale/ormeggio/configurazione", icona: "ingranaggio", nome: "Configurazione", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio", primaria: false },
];
