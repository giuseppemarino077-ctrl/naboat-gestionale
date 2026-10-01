// Normalizzazione condivisa dei numeri di telefono (region default IT).
//
// Un numero italiano senza prefisso usa +39; i prefissi internazionali espliciti
// (+… oppure 00…) sono conservati. Lo zero significativo dei fissi italiani resta.
// Il valore canonico (E.164 con "+") è quello salvato per ricerca e unicità; la
// visualizzazione è leggibile. Non si confrontano solo le ultime dieci cifre.
const REGIONE_DEFAULT = "39";

export type EsitoTelefono =
  | { ok: true; canonico: string; cifre: string; display: string; wa: string }
  | { ok: false; motivo: string };

function pulisci(input: string): string {
  // Spazi (anche non separabili), trattini, parentesi, punti e barre.
  return input.replace(/[\s\u00a0\u202f]/g, "").replace(/[()\-./]/g, "");
}

export function normalizzaTelefono(input: string | null | undefined): EsitoTelefono {
  const raw = pulisci(input ?? "");
  if (!raw) return { ok: false, motivo: "Numero mancante" };
  if (!/^\+?\d+$/.test(raw)) return { ok: false, motivo: "Il numero contiene caratteri non validi" };

  let cifre: string;
  if (raw.startsWith("+")) cifre = raw.slice(1);
  else if (raw.startsWith("00")) cifre = raw.slice(2);
  else if (raw.length >= 11 && raw.startsWith(REGIONE_DEFAULT)) cifre = raw; // già prefissato
  else cifre = REGIONE_DEFAULT + raw;

  if (!/^\d+$/.test(cifre)) return { ok: false, motivo: "Il numero contiene caratteri non validi" };
  if (cifre.length < 8 || cifre.length > 15) return { ok: false, motivo: "Il numero deve contenere da 8 a 15 cifre" };
  // Rifiuta numeri palesemente fittizi (tutte le cifre uguali).
  if (/^(\d)\1+$/.test(cifre)) return { ok: false, motivo: "Numero non valido" };

  const canonico = `+${cifre}`;
  const display = cifre.startsWith(REGIONE_DEFAULT) ? `+${REGIONE_DEFAULT} ${cifre.slice(2)}` : canonico;
  return { ok: true, canonico, cifre, display, wa: cifre };
}

// Chiave di deduplicazione canonica. null se il numero non è valido o manca.
export function chiaveTelefono(input: string | null | undefined): string | null {
  const esito = normalizzaTelefono(input);
  return esito.ok ? esito.canonico : null;
}

// Formattazione leggibile per l'interfaccia.
export function mostraTelefono(input: string | null | undefined): string {
  if (!input) return "";
  const esito = normalizzaTelefono(input);
  return esito.ok ? esito.display : input;
}

// Numero per i link wa.me (senza "+").
export function telefonoWhatsApp(input: string | null | undefined): string | null {
  const esito = normalizzaTelefono(input);
  return esito.ok ? esito.wa : null;
}

// Confronto canonico fra due numeri (per ricerca).
export function stessoTelefono(a: string | null | undefined, b: string | null | undefined): boolean {
  const ca = chiaveTelefono(a);
  const cb = chiaveTelefono(b);
  return !!ca && ca === cb;
}
