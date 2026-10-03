"use client";
import { useEffect, useState } from "react";
import { Icona } from "./Icona";

type Notifica = { id: number; testo: string };

// Percorsi in cui una mutazione riuscita non è un "salvataggio" da confermare
// all'operatore (accesso, form pubblici, automazioni, webhook).
const ESCLUSI = [
  "/api/v1/auth/",
  "/api/v1/cliente/login",
  "/api/v1/cliente/registrazione",
  "/api/v1/cliente/password-reset",
  "/api/v1/contatti",
  "/api/v1/richieste",
  "/api/v1/promemoria/",
  "/api/v1/backup/",
  "/api/v1/admin/piani",
  "/webhook",
];

function percorsoDi(input: RequestInfo | URL): string {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (url.startsWith("http")) {
    try { return new URL(url).pathname; } catch { return url; }
  }
  return url;
}

function metodoDi(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input === "object" && !(input instanceof URL) && "method" in input) return input.method.toUpperCase();
  return "GET";
}

// Conferma globale dell'avvenuto salvataggio: intercetta le mutazioni riuscite
// verso le API del gestionale e mostra un avviso temporaneo. Le letture (GET) e
// le azioni che non sono salvataggi restano silenziose.
export function NotificheSalvataggio() {
  const [lista, setLista] = useState<Notifica[]>([]);

  useEffect(() => {
    const originale = window.fetch;
    let ultimo = 0;

    const mostra = (testo: string) => {
      const id = Date.now() + Math.random();
      setLista((l) => [...l.slice(-2), { id, testo }]);
      window.setTimeout(() => setLista((l) => l.filter((n) => n.id !== id)), 2800);
    };

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const risposta = await originale(input, init);
      try {
        const metodo = metodoDi(input, init);
        const percorso = percorsoDi(input);
        const mutazione = ["POST", "PATCH", "PUT", "DELETE"].includes(metodo);
        if (
          risposta.ok &&
          mutazione &&
          percorso.startsWith("/api/v1/") &&
          !ESCLUSI.some((e) => percorso.startsWith(e))
        ) {
          const ora = Date.now();
          if (ora - ultimo > 700) {
            ultimo = ora;
            mostra(metodo === "DELETE" ? "Eliminazione completata" : "Salvataggio completato");
          }
        }
      } catch { /* l'avviso non deve mai influire sulla chiamata */ }
      return risposta;
    };

    return () => { window.fetch = originale; };
  }, []);

  if (!lista.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[120] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {lista.map((n) => (
        <div
          key={n.id}
          role="status"
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-ok-line bg-white px-4 py-2 text-sm font-semibold text-ok shadow-lg"
        >
          <Icona nome="check" className="h-4 w-4" /> {n.testo}
        </div>
      ))}
    </div>
  );
}
