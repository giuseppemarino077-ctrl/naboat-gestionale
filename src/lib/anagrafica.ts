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

export type TokenOspite = { token: string; scadenza: Date };

// Token casuale monouso per collegare una richiesta ospite all'area personale.
// Vale 7 giorni: il collegamento si fa quando si vuole, non solo il giorno stesso.
export function nuovoTokenOspite(ore = 24 * 7): TokenOspite {
  return {
    token: randomBytes(32).toString("hex"),
    scadenza: new Date(Date.now() + ore * 60 * 60 * 1000),
  };
}
