// Anagrafica clienti: normalizzazione e deduplicazione in un unico posto.
//
// Regola: un Customer è identificato dalla chiave `dedupKey`, cioè il telefono
// normalizzato. Due richieste con lo stesso numero sono lo stesso cliente; nomi
// uguali con numeri diversi restano persone distinte. Non si fondono mai due
// anagrafiche in automatico per il solo nome: un eventuale conflitto si gestisce
// esplicitamente (es. 409 quando un PATCH tenta di usare un telefono già occupato).
import { randomBytes } from "crypto";

// Telefono confrontabile: solo cifre, ultime 15 (prefisso internazionale incluso).
export function normalizzaTelefono(tel: string | null | undefined): string {
  return (tel ?? "").replace(/\D/g, "").slice(-15);
}

// Email confrontabile: senza spazi e in minuscolo. null se vuota.
export function normalizzaEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e.length ? e : null;
}

// Chiave di deduplicazione dell'anagrafica: il telefono normalizzato.
export function chiaveDedup(telefono: string | null | undefined): string {
  return normalizzaTelefono(telefono);
}

// Chiave di deduplica per i clienti senza telefono: email se presente, altrimenti
// un identificatore stabile per nome + suffisso casuale. Un cliente senza contatti
// non si identifica mai per il solo nome (due omonimi restano persone distinte).
export function chiaveDedupContatti(
  telefono: string | null | undefined,
  email: string | null | undefined,
  nome: string
): string {
  const tel = normalizzaTelefono(telefono);
  if (tel) return tel;
  const mail = normalizzaEmail(email);
  if (mail) return `e:${mail}`;
  const base = nome.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
  return `n:${base}:${randomBytes(6).toString("hex")}`;
}

// Normalizzazione del nome per il confronto (solo presentazione/diagnostica).
export function normalizzaNome(nome: string): string {
  return nome.trim().toLowerCase().replace(/\s+/g, " ");
}

export type TokenOspite = { token: string; scadenza: Date };

// Token casuale monouso per collegare una richiesta ospite all'area personale.
// Vale 7 giorni: il collegamento si fa quando si vuole, non solo il giorno stesso.
export function nuovoTokenOspite(ore = 24 * 7): TokenOspite {
  return {
    token: randomBytes(32).toString("hex"),
    scadenza: new Date(Date.now() + ore * 60 * 60 * 1000),
  };
}
