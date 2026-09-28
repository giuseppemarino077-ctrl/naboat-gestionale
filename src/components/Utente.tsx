"use client";
import { useEffect, useState } from "react";

// Utente collegato: una sola richiesta condivisa da tutte le pagine.
export type Utente = {
  id: string;
  email: string;
  nome: string | null;
  role: string;
  tenantId: string | null;
  tenantNome: string | null;
  tenantLogo: string | null;
  tenantStatus: string | null;
  tenantModulo: string | null;
  tenantOrmeggio: boolean;
  vedeImporti: boolean;
  twoFactorEnabled: boolean;
  twoFactorRequired: boolean;
};

// Si tiene in memoria solo un utente VALIDO. Se la sessione non è valida (null)
// non si memorizza niente, così al prossimo mount si riprova invece di restare
// con il menù vuoto per sempre.
let cache: Utente | null = null;
let inCorso: Promise<Utente | null> | null = null;

async function carica(forza = false): Promise<Utente | null> {
  if (!forza && cache) return cache;
  if (!inCorso) {
    inCorso = fetch("/api/v1/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        const u = (j?.user ?? null) as Utente | null;
        cache = u;
        return u;
      })
      .catch(() => cache)
      .finally(() => {
        inCorso = null;
      });
  }
  return inCorso;
}

// Con { redirect: true } (solo nelle pagine riservate) una sessione assente o scaduta
// riporta all'accesso, invece di lasciare le pagine vuote. Sulle pagine pubbliche no.
export function useUtente(opts: { redirect?: boolean } = {}) {
  const [utente, setUtente] = useState<Utente | null>(cache);
  useEffect(() => {
    let vivo = true;
    carica().then((u) => {
      if (!vivo) return;
      if (!u) {
        if (opts.redirect) window.location.href = "/login";
        return;
      }
      setUtente(u);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return utente;
}

export function dimenticaUtente() {
  cache = null;
  inCorso = null;
}

export async function ricaricaUtente() {
  return carica(true);
}
