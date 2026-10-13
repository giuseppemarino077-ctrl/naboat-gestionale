import type { Posto } from "./components/tipi-griglia";

export type CategoriaPosti = "occupati" | "liberi" | "nonUsabili";

function appartiene(posto: Posto, categoria: CategoriaPosti | null) {
  switch (categoria) {
    case "occupati": return !!posto.permanenza;
    case "liberi": return !posto.permanenza && !posto.bloccato;
    case "nonUsabili": return posto.bloccato;
    default: return false;
  }
}

export function evidenzaPosto(posto: Posto, selezione: CategoriaPosti | null, anteprima: CategoriaPosti | null) {
  if (appartiene(posto, selezione)) return "selezione";
  if (appartiene(posto, anteprima)) return "anteprima";
  return undefined;
}
