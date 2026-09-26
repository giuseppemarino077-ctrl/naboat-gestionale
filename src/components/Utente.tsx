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

let cache: Utente | null | undefined;
let inCorso: Promise<Utente | null> | null = null;

async function carica(): Promise<Utente | null> {
  if (cache !== undefined) return cache;
  if (!inCorso) {
    inCorso = fetch("/api/v1/auth/me")
      .then((r) => r.json())
      .then((j) => {
        cache = (j?.user ?? null) as Utente | null;
        return cache;
      })
      .catch(() => null)
      .finally(() => {
        inCorso = null;
      });
  }
  return inCorso;
}

export function useUtente() {
  const [utente, setUtente] = useState<Utente | null | undefined>(cache);
  useEffect(() => {
    let vivo = true;
    carica().then((u) => vivo && setUtente(u));
    return () => {
      vivo = false;
    };
  }, []);
  return utente;
}

export function dimenticaUtente() {
  cache = undefined;
}
