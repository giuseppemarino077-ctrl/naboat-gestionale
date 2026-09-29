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
  emailVerified: boolean;
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
// Il contesto si riaggiorna al ritorno sulla scheda e periodicamente, così approvazioni,
// sospensioni e cambi di permesso diventano visibili senza ricaricare a mano (B07).
export function useUtente(opts: { redirect?: boolean } = {}) {
  const [utente, setUtente] = useState<Utente | null>(cache);
  useEffect(() => {
    let vivo = true;
    const aggiorna = async (forza: boolean) => {
      const u = await carica(forza);
      if (!vivo) return;
      if (!u) {
        if (opts.redirect) window.location.href = "/gestionale/accesso";
        return;
      }
      setUtente(u);
    };
    aggiorna(false);
    const alFocus = () => aggiorna(true);
    const allaVisibilita = () => {
      if (document.visibilityState === "visible") aggiorna(true);
    };
    const intervallo = window.setInterval(alFocus, 10000);
    window.addEventListener("focus", alFocus);
    document.addEventListener("visibilitychange", allaVisibilita);
    return () => {
      vivo = false;
      window.removeEventListener("focus", alFocus);
      document.removeEventListener("visibilitychange", allaVisibilita);
      window.clearInterval(intervallo);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
