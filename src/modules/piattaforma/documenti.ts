import crypto from "crypto";


// C01 — Versione immutabile del contratto.
// Alla generazione il documento viene congelato in uno snapshot (testo, dati,
// importi, condizioni) e legato alla firma da un'impronta sha256. La pagina
// pubblica rende solo lo snapshot; la firma è un aggiornamento condizionale sulla
// stessa versione. Non è una dichiarazione di validità legale: è una traccia.
// Le condizioni predefinite vivono in @/lib/contratto-testo (importabili anche dal client).

// Serializzazione stabile: le chiavi sono ordinate, così la stessa versione ha
// sempre la stessa impronta, indipendentemente dall'ordine di costruzione.
export function canonico(valore: unknown): string {
  if (valore === null || typeof valore !== "object") return JSON.stringify(valore) ?? "null";
  if (Array.isArray(valore)) return `[${valore.map(canonico).join(",")}]`;
  const obj = valore as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonico(obj[k])}`).join(",")}}`;
}

// L'impronta copre i contenuti mostrati. La data di generazione è metadato e viene
// esclusa, così rigenerare la stessa versione non produce impronte diverse.
export function improntaContratto(snapshot: unknown): string {
  const contenuto = { ...((snapshot ?? {}) as Record<string, unknown>) };
  delete contenuto.generatoAt;
  return crypto.createHash("sha256").update(canonico(contenuto)).digest("hex");
}

// IP della richiesta: usato come evidenza della firma (come già nel progetto).
export function ipRichiesta(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "non rilevato"
  );
}
