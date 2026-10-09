"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useUtente } from "@/components/Utente";
import { Avviso } from "@/components/ui/Avviso";
import { IntestazioneOrmeggio, RiepilogoOrmeggio } from "@/modules/ormeggio/components/IntestazioneOrmeggio";
import { useAggiornamenti, segnalaCambiamento } from "@/lib/aggiorna";

type Attivita = {
  id: string; tipo: string; stato: string; dataPrevista: string | null; permanenzaId: string;
  addetto: { id: string; nome: string | null } | null;
  daAddebitare: boolean; permanenza: { boat: { nome: string }; posto: { codice: string } | null };
};

export default function DaFarePage() {
  const [attivita, setAttivita] = useState<Attivita[]>([]);
  const [err, setErr] = useState("");
  const [caricamento, setCaricamento] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [stato, setStato] = useState("");
  const [mie, setMie] = useState(false);
  const utente = useUtente();
  const carica = async () => {
    try {
      const r = await fetch("/api/v1/ormeggio/attivita?daFare=1");
      const j = await r.json();
      if (!r.ok || !Array.isArray(j)) { setErr(j.error ?? "Non riesco a leggere le attività."); return; }
      setAttivita(j);
    } catch { setErr("Connessione interrotta. Riprova."); }
    finally { setCaricamento(false); }
  };
  useEffect(() => { carica(); }, []);
  useAggiornamenti(() => { if (!busy) return carica(); }, ["ormeggio"]);
  const cambia = async (a: Attivita, nuovoStato: string) => {
    if (busy) return;
    setBusy(a.id); setErr("");
    try {
      const r = await fetch(`/api/v1/ormeggio/attivita/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stato: nuovoStato }) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? "Operazione non riuscita."); return; }
      await carica(); segnalaCambiamento("ormeggio");
    } catch { setErr("Connessione interrotta: aggiorna l’elenco prima di riprovare."); }
    finally { setBusy(null); }
  };
  const oggi = new Date().toLocaleDateString("sv-SE");
  const visibili = attivita.filter((a) => (!stato || a.stato === stato) && (!mie || a.addetto?.id === utente?.id) && `${a.tipo} ${a.permanenza.boat.nome} ${a.permanenza.posto?.codice ?? ""} ${a.addetto?.nome ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="grid gap-3">
      <IntestazioneOrmeggio titolo="Attività" descrizione="Lavori da avviare e in corso, collegati alla scheda e al conto della barca." azioni={<button className="btn-soft" disabled={!!busy} onClick={() => { setErr(""); carica(); }}>Aggiorna</button>} />
      {err && <Avviso tono="errore">{err}</Avviso>}
      <RiepilogoOrmeggio voci={[
        { nome: "Da fare", valore: attivita.filter((a) => a.stato === "da_fare").length },
        { nome: "In corso", valore: attivita.filter((a) => a.stato === "in_corso").length },
        { nome: "In ritardo", valore: attivita.filter((a) => a.dataPrevista && a.dataPrevista.slice(0, 10) < oggi).length },
      ]} />
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Cerca attività" className="campo min-w-[180px] flex-1" placeholder="Barca, posto, lavoro o addetto…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Stato attività" className="campo !w-auto" value={stato} onChange={(e) => setStato(e.target.value)}><option value="">Da fare e in corso</option><option value="da_fare">Da fare</option><option value="in_corso">In corso</option></select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mie} onChange={(e) => setMie(e.target.checked)} /> Assegnate a me</label>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-muted"><tr className="text-left"><th>Barca / posto</th><th>Lavoro</th><th>Data prevista</th><th>Addetto</th><th>Stato</th><th>Azioni</th></tr></thead>
          <tbody>
            {visibili.map((a) => <tr key={a.id} className="border-t border-line">
              <td><Link className="font-semibold text-ocean" href={`/gestionale/ormeggio/permanenza/${a.permanenzaId}?tab=attivita`}>{a.permanenza.boat.nome}</Link><p className="text-xs text-muted">{a.permanenza.posto?.codice ?? "Senza posto"}</p></td>
              <td>{a.tipo}</td><td className={a.dataPrevista && a.dataPrevista.slice(0, 10) < oggi ? "font-semibold text-coral" : ""}>{a.dataPrevista ? new Date(a.dataPrevista).toLocaleDateString("it-IT") : "Da programmare"}</td>
              <td>{a.addetto?.nome ?? "Non assegnata"}</td><td><span className={a.stato === "in_corso" ? "badge-pending" : "badge-block"}>{a.stato.replace("_", " ")}</span></td>
              <td><div className="flex flex-wrap gap-2">
                {a.stato === "da_fare" && <button disabled={!!busy} className="btn-soft" onClick={() => cambia(a, "in_corso")}>Avvia</button>}
                {utente?.vedeImporti || !a.daAddebitare ? <button disabled={!!busy || !utente} className="btn-soft" onClick={() => cambia(a, "completato")}>{busy === a.id ? "Salvo…" : "Completa"}</button> : <span className="text-xs text-muted">Completamento con addebito: personale autorizzato</span>}
                <Link className="btn-ghost" href={`/gestionale/ormeggio/permanenza/${a.permanenzaId}?tab=attivita`}>Scheda →</Link>
              </div></td>
            </tr>)}
            {!visibili.length && <tr><td colSpan={6} className="text-muted">{caricamento ? "Carico le attività…" : err ? "Elenco non disponibile." : attivita.length ? "Nessuna attività corrisponde ai filtri." : "Nessun lavoro in sospeso. I lavori completati restano nella scheda della barca."}</td></tr>}
          </tbody>
        </table>
      </div>
      {attivita.length >= 200 && <p className="text-xs text-muted">Mostrate le prime 200 attività: consulta le singole schede per il dettaglio completo.</p>}
    </div>
  );
}
