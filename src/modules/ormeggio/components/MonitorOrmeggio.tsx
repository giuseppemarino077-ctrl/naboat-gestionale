"use client";
import { richiestaOrmeggio } from "@/modules/ormeggio/richiesta";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUtente } from "@/components/Utente";
import { useAggiornamenti } from "@/lib/aggiorna";
import { oggi } from "@/modules/piattaforma/date";
import { GrigliaPosti } from "@/modules/ormeggio/components/GrigliaPosti";
import { Avviso } from "@/components/ui/Avviso";
import type { Area, Perm } from "@/modules/ormeggio/components/tipi-griglia";
export function MonitorOrmeggio() {
  const u = useUtente();
  const [aree, setAree] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState("");
  const [sel, setSel] = useState<Perm | null>(null);
  const [errore, setErrore] = useState("");
  const [aggiornato, setAggiornato] = useState("");
  const richiesta = useRef(0);
  const autorizzato = !!u && u.accessoOrmeggio !== false && (u.role === "owner" || u.role === "superadmin" || u.ruoloOrmeggio === "responsabile" || u.ruoloOrmeggio === "addetto");
  const load = useCallback(async () => {
    if (!autorizzato) return;
    const seq = ++richiesta.current;
    try { const r = await richiestaOrmeggio(`/api/v1/ormeggio/griglia?data=${oggi()}`, { cache: "no-store" }); const j = await r.json(); if (seq !== richiesta.current) return; if (!r.ok) { setErrore(j.error); setAree([]); setSel(null); return; } setAree(j.aree); setSel(null); setErrore(""); setAggiornato(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })); }
    catch { if (seq === richiesta.current) setErrore("Connessione interrotta. Dati non aggiornati."); }
  }, [autorizzato]);
  useEffect(() => { load(); return () => { richiesta.current++; }; }, [load]);
  useAggiornamenti(load, ["ormeggio"]);
  const area = aree.find((a) => a.id === areaId) ?? aree[0];
  if (!autorizzato) return <Avviso tono="info">Per il monitor serve un accesso attivo al modulo Ormeggio.</Avviso>;
  return <div className="grid gap-3"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl">Quadro posti · sola lettura</h1><span className="text-xs text-muted">{aggiornato && `Aggiornato alle ${aggiornato}`}</span></div>{errore && <Avviso tono="errore" azione={<button className="btn-soft" onClick={load}>Riprova</button>}>{errore}</Avviso>}<select aria-label="Area" className="campo max-w-xs" value={area?.id ?? ""} onChange={(e) => { setAreaId(e.target.value); setSel(null); }}>{aree.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select>{sel && <div className="card flex flex-wrap items-center gap-4 p-4 text-sm"><b>{sel.boatNome}</b><span>{sel.boatTipo}</span><span>{sel.inMare ? "In mare · posto riservato" : "In struttura"}</span><button className="ml-auto text-ocean" onClick={() => setSel(null)}>Chiudi</button></div>}{area && <GrigliaPosti area={area} solaLettura configura={false} busy={false} trascinabile={false} corrisponde={() => true} evidenza={() => undefined} onSeleziona={setSel} onAssegna={() => {}} onToggleBlocco={() => {}} onSposta={async () => false} onErrore={setErrore} onTrascinamento={() => {}} />}{!area && !errore && <p className="card p-6 text-muted">Nessun posto configurato.</p>}</div>;
}
