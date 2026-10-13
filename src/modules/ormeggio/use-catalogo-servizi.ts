"use client";
import { richiestaOrmeggio } from "@/modules/ormeggio/richiesta";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUtente } from "@/components/Utente";
import { useAggiornamenti } from "@/lib/aggiorna";

export type ServizioOrmeggio = { id: string; revisione: number; nome: string; prezzoCent: number | null; unita: string | null };

export function useCatalogoServizi() {
  const utente = useUtente();
  const ruolo = utente?.role;
  const puoLeggere = ruolo === "owner" || utente?.ruoloOrmeggio === "responsabile";
  const [servizi, setServizi] = useState<ServizioOrmeggio[]>([]);
  const [caricamento, setCaricamento] = useState(true);
  const [errore, setErrore] = useState("");
  const richiesta = useRef(0);

  const carica = useCallback(async () => {
    const seq = ++richiesta.current;
    try {
      const r = await richiestaOrmeggio("/api/v1/ormeggio/servizi");
      const j = await r.json();
      if (seq !== richiesta.current) return;
      if (!r.ok || !Array.isArray(j)) { setErrore(j?.error ?? "Non riesco a leggere il catalogo servizi."); return; }
      setServizi(j); setErrore("");
    } catch { if (seq === richiesta.current) setErrore("Connessione interrotta. Riprova a caricare il catalogo."); }
    finally { if (seq === richiesta.current) setCaricamento(false); }
  }, []);

  const prepara = useCallback(async () => {
    if (!ruolo) return;
    if (!puoLeggere) { setServizi([]); setCaricamento(false); return; }
    const seq = ++richiesta.current;
    setCaricamento(true); setErrore("");
    try {
      if (ruolo === "owner") {
        const r = await richiestaOrmeggio("/api/v1/ormeggio/servizi/predefiniti", { method: "POST" });
        if (!r.ok) throw new Error("Non riesco a preparare il catalogo servizi. Riprova.");
      }
      if (seq === richiesta.current) await carica();
    } catch (e) { if (seq === richiesta.current) { setErrore(e instanceof Error ? e.message : "Non riesco a preparare il catalogo servizi."); setCaricamento(false); } }
  }, [ruolo, puoLeggere, carica]);

  useEffect(() => { prepara(); return () => { richiesta.current++; }; }, [prepara]);
  useAggiornamenti(() => {
    if (!caricamento && puoLeggere) return carica();
  }, ["ormeggio"]);

  return { servizi, caricamento, errore, carica, prepara, vedeImporti: utente?.vedeImporti === true, puoModificare: ruolo === "owner" };
}
