import { NextResponse } from "next/server";

// Paginazione retro-compatibile delle liste (T05).
//
// Due forme di risposta, decise dalla richiesta:
// - SENZA `?page`: si mantiene la forma storica (array), con al più `massimo` righe
//   e l'header `X-Total-Count` (conteggio totale, non solo le righe restituite).
// - CON `?page` (e `?limit` facoltativo): involucro
//   { items, totale, pagina, dimensione, pagine }.
// Conteggio e finestra sono sempre calcolati dal database: mai filtrare in memoria.
// Il tetto `massimo` protegge da risposte enormi; `limit` non può superarlo.

export const LIMITE_PAGINA = 200;

export type Paginazione = {
  attiva: boolean; // il client ha chiesto una pagina esplicita (?page)
  pagina: number; // pagina richiesta (1-based)
  dimensione: number; // righe da restituire (equivale al take)
  salta: number; // righe da saltare (skip)
};

function intero(v: string | null, predefinito: number): number {
  if (v == null || v === "") return predefinito;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : predefinito;
}

export function leggiPaginazione(q: URLSearchParams, massimo = LIMITE_PAGINA): Paginazione {
  const tetto = Math.max(1, massimo);
  // Senza `?page` restano la forma array e il tetto storico dell'endpoint.
  if (!q.has("page")) return { attiva: false, pagina: 1, dimensione: tetto, salta: 0 };
  const pagina = intero(q.get("page"), 1);
  const dimensione = Math.min(intero(q.get("limit"), tetto), tetto);
  return { attiva: true, pagina, dimensione, salta: (pagina - 1) * dimensione };
}

// `items` è già nella forma finale (filtri per permesso applicati dal chiamante).
export function rispostaPaginata(items: unknown, totale: number, p: Paginazione) {
  if (!p.attiva) {
    return NextResponse.json(items, { headers: { "X-Total-Count": String(totale) } });
  }
  return NextResponse.json({
    items,
    totale,
    pagina: p.pagina,
    dimensione: p.dimensione,
    // Numero di pagine disponibili (0 se non c'è nulla da mostrare).
    pagine: Math.ceil(totale / p.dimensione),
  });
}
