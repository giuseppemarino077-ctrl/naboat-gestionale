import { TIPI_BARCA } from "@/modules/piattaforma/barche";

export const OPZIONI_TIPI = TIPI_BARCA.map((t) => ({
  valore: t.codice,
  etichetta: t.nome,
  dettaglio: t.settore === "vela" ? "vela" : undefined,
}));
