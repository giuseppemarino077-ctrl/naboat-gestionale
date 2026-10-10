"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUtente } from "@/components/Utente";
import { useAggiornamenti } from "@/lib/aggiorna";

export type ServizioOrmeggio = { id: string; nome: string; prezzoCent: number | null; unita: string | null };

export function useCatalogoServizi() {
  const utente = useUtente();
  const ruolo = utente?.role;
  const [servizi, setServizi] = useState<ServizioOrmeggio[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");
  const richiesta = useRef(0);

  const carica = useCallback(async () => {
    const seq = ++richiesta.current;
    try {
      const r = await fetch("/api/v1/ormeggio/servizi");
      const j = await r.json();
      if (seq !== richiesta.current) return;
      if (!r.ok || !Array.isArray(j)) { setErrore(j?.error ?? "Non riesco a leggere il catalogo servizi."); return; }
      setServizi(j); setErrore("");
    } catch { if (seq === richiesta.current) setErrore("Connessione interrotta. Riprova a caricare il catalogo."); }
    finally { if (seq === richiesta.current) setCaricamento(false); }
  }, []);

  const prepara = useCallback(async () => {
    if (!ruolo) return;
    const seq = ++richiesta.current;
    setCaricamento(true); setErrore("");
    try {
      if (ruolo !== "skipper") {
        const r = await fetch("/api/v1/ormeggio/servizi/predefiniti", { method: "POST" });
        if (!r.ok) throw new Error("Non riesco a preparare il catalogo servizi. Riprova.");
      }
      if (seq === richiesta.current) await carica();
    } catch (e) { if (seq === richiesta.current) { setErrore(e instanceof Error ? e.message : "Non riesco a preparare il catalogo servizi."); setCaricamento(false); } }
  }, [ruolo, carica]);

  useEffect(() => { prepara(); return () => { richiesta.current++; }; }, [prepara]);
  useAggiornamenti(() => {
    if (!caricamento) return carica();
  }, ["ormeggio"]);

  return { servizi, caricamento, errore, carica, prepara, vedeImporti: utente?.vedeImporti === true, puoModificare: ruolo === "owner" || ruolo === "operatore" };
}
