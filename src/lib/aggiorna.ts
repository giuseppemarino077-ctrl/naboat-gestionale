"use client";
import { useEffect, useRef } from "react";

// Allineamento tra viste operative (due operatori che lavorano insieme non devono
// sovrascriversi in silenzio). Nessun WebSocket: un evento per la stessa scheda e
// un ricarico mirato al focus e ogni ~10 secondi per le altre schede/utenti.

const EVENTO = "naboat:aggiorna";

// Notifica le viste in ascolto nella stessa scheda. La chiave (facoltativa) permette
// di limitare il ricarico a chi è interessato (es. "prenotazioni", "ormeggio").
export function segnalaCambiamento(chiave?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { chiave: chiave ?? null } }));
}

// Esegue `callback` quando una vista segnala un cambiamento, al ritorno sulla scheda
// (focus/visibilitychange) e con un intervallo mirato (~10s). Non ricarica mentre la
// scheda è in background e non sovrappone due esecuzioni. Pulisce tutto allo smontaggio.
export function useAggiornamenti(callback: () => void | Promise<void>, chiavi?: string[]) {
  const cb = useRef(callback);
  useEffect(() => { cb.current = callback; });

  // Le chiavi si confrontano come stringa per non ricreare i listener a ogni render.
  const chiaviKey = (chiavi ?? []).join("|");

  useEffect(() => {
    let vivo = true;
    let inCorso = false;
    const chiaviAccettate = chiaviKey ? chiaviKey.split("|") : null;

    const esegui = async () => {
      if (!vivo || inCorso) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      inCorso = true;
      try { await cb.current(); } catch { /* il ricarico di sfondo non deve far cadere nulla */ } finally { inCorso = false; }
    };

    const allEvento = (e: Event) => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const chiave = (e as CustomEvent<{ chiave?: string | null }>).detail?.chiave ?? null;
      // Un evento con chiave raggiunge solo le viste interessate; senza chiave vale per tutti.
      if (chiaviAccettate && chiave && !chiaviAccettate.includes(chiave)) return;
      esegui();
    };
    const alFocus = () => esegui();
    const allaVisibilita = () => { if (document.visibilityState === "visible") esegui(); };

    const intervallo = window.setInterval(esegui, 10000);
    window.addEventListener(EVENTO, allEvento);
    window.addEventListener("focus", alFocus);
    document.addEventListener("visibilitychange", allaVisibilita);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO, allEvento);
      window.removeEventListener("focus", alFocus);
      document.removeEventListener("visibilitychange", allaVisibilita);
      window.clearInterval(intervallo);
    };
  }, [chiaviKey]);
}
