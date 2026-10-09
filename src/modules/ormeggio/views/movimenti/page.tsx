"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avviso } from "@/components/ui/Avviso";
import { IntestazioneOrmeggio, RiepilogoOrmeggio } from "@/modules/ormeggio/components/IntestazioneOrmeggio";
import { useAggiornamenti } from "@/lib/aggiorna";

type Movimento = { id: string; tipo: string; previstoAt: string | null; effettivoAt: string | null; note: string | null; permanenzaId: string; permanenza: { boat: { nome: string }; posto: { codice: string } | null } };
const dataIt = (d: string | null) => d ? new Date(d).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—";
export default function MovimentiPage() {
  const [movimenti, setMovimenti] = useState<Movimento[]>([]);
  const [data, setData] = useState("");
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [err, setErr] = useState("");
  const [caricamento, setCaricamento] = useState(true);
  const richiesta = useRef(0);
  const carica = useCallback(async () => {
    const seq = ++richiesta.current;
    try {
      const r = await fetch(`/api/v1/ormeggio/movimenti${data ? `?data=${data}` : ""}`);
      const j = await r.json();
      if (seq !== richiesta.current) return;
      if (!r.ok || !Array.isArray(j)) { setErr(j.error ?? "Non riesco a leggere i movimenti."); return; }
      setMovimenti(j);
    } catch { if (seq === richiesta.current) setErr("Connessione interrotta. Riprova."); }
    finally { if (seq === richiesta.current) setCaricamento(false); }
  }, [data]);
  useEffect(() => { setCaricamento(true); carica(); }, [carica]);
  useAggiornamenti(carica, ["ormeggio"]);
  const visibili = movimenti.filter((m) => (!tipo || m.tipo === tipo) && `${m.permanenza.boat.nome} ${m.permanenza.posto?.codice ?? ""} ${m.note ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="grid gap-3">
      <IntestazioneOrmeggio titolo="Movimenti" descrizione="Uscite, rientri e trasferimenti. Il posto rimane assegnato durante l’uscita in mare." azioni={<button className="btn-soft" onClick={() => { setErr(""); carica(); }}>Aggiorna</button>} />
      {err && <Avviso tono="errore">{err}</Avviso>}
      <RiepilogoOrmeggio voci={[{ nome: "Registrazioni caricate", valore: movimenti.length }, { nome: "Uscite", valore: movimenti.filter((m) => m.tipo === "uscita").length }, { nome: "Rientri", valore: movimenti.filter((m) => m.tipo === "rientro").length }, { nome: "Programmate", valore: movimenti.filter((m) => m.tipo === "uscita_programmata").length }]} />
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Giorno dei movimenti" type="date" className="campo !w-auto" value={data} onChange={(e) => setData(e.target.value)} />
        <button className="btn-soft" onClick={() => setData(new Date().toLocaleDateString("sv-SE"))}>Oggi</button>
        {data && <button className="btn-ghost" onClick={() => setData("")}>Tutte le date</button>}
        <input aria-label="Cerca movimenti" className="campo min-w-[180px] flex-1" placeholder="Barca, posto o note…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Tipo movimento" className="campo !w-auto" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Tutti i tipi</option><option value="uscita_programmata">Uscite programmate</option><option value="uscita">Uscite effettive</option><option value="rientro">Rientri</option><option value="trasferimento">Trasferimenti</option></select>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[740px] text-sm">
          <thead className="text-muted"><tr className="text-left"><th>Tipo</th><th>Barca / posto attuale</th><th>Previsto</th><th>Effettivo</th><th>Note</th><th><span className="sr-only">Azioni</span></th></tr></thead>
          <tbody>{visibili.map((m) => <tr key={m.id} className="border-t border-line">
            <td className="font-semibold">{m.tipo.replace("_", " ")}</td><td><Link className="font-semibold text-ocean" href={`/gestionale/ormeggio/permanenza/${m.permanenzaId}`}>{m.permanenza.boat.nome}</Link><p className="text-xs text-muted">{m.permanenza.posto?.codice ?? "Senza posto"}</p></td>
            <td className="whitespace-nowrap">{dataIt(m.previstoAt)}</td><td className="whitespace-nowrap">{dataIt(m.effettivoAt)}</td><td className="max-w-xs text-muted">{m.note ?? "—"}</td><td><Link className="btn-ghost whitespace-nowrap" href={`/gestionale/ormeggio/permanenza/${m.permanenzaId}`}>Scheda →</Link></td>
          </tr>)}{!visibili.length && <tr><td colSpan={6} className="text-muted">{caricamento ? "Carico i movimenti…" : err ? "Elenco non disponibile." : "Nessun movimento corrisponde ai filtri."}</td></tr>}</tbody>
        </table>
      </div>
      {movimenti.length >= 300 && <p className="text-xs text-muted">Mostrati fino a 300 movimenti. Seleziona un giorno o consulta la scheda per cercare nello storico.</p>}
    </div>
  );
}
