import { MARCHE_BARCHE } from "@/modules/noleggio/modelli-barche";
export { OPZIONI_TIPI } from "@/modules/piattaforma/tipi-barche";

export const OPZIONI_MODELLI = MARCHE_BARCHE.flatMap((m) =>
  m.modelli.map((mod) => ({ valore: `${m.marca} ${mod}`, etichetta: `${m.marca} ${mod}`, dettaglio: m.marca }))
);
