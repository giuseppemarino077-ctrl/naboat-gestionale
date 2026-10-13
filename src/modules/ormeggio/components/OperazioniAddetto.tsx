"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { richiestaOrmeggio } from "@/modules/ormeggio/richiesta";
import { useAggiornamenti, segnalaCambiamento } from "@/lib/aggiorna";
import { oggi } from "@/modules/piattaforma/date";
import { GrigliaPosti } from "@/modules/ormeggio/components/GrigliaPosti";
import { Dialogo } from "@/components/ui/Dialogo";
import { Avviso } from "@/components/ui/Avviso";
import type { Area, Perm, Posto } from "@/modules/ormeggio/components/tipi-griglia";
export function OperazioniAddetto({ permanenzaId }: { permanenzaId?: string }) {
  const [aree, setAree] = useState<Area[]>([]);
  const [areaId, setAreaId] = useState("");
  const [selId, setSelId] = useState(permanenzaId ?? "");
  const [dettaglio, setDettaglio] = useState<any>(null);
  const [posto, setPosto] = useState<Posto | null>(null);
  const [barche, setBarche] = useState<{ id: string; nome: string; proprietarioId: string }[]>([]);
  const [boatId, setBoatId] = useState("");
  const [errore, setErrore] = useState("");
  const [busy, setBusy] = useState(false);
  const [aggiornato, setAggiornato] = useState("");
  const [spostaId, setSpostaId] = useState("");
  const richiesta = useRef(0);
  const load = useCallback(async () => {
    const seq = ++richiesta.current;
    try {
      const r = await richiestaOrmeggio(`/api/v1/ormeggio/griglia?data=${oggi()}`); const j = await r.json();
      if (seq !== richiesta.current) return;
      if (!r.ok) { setAree([]); setDettaglio(null); setErrore(j.error); return; }
      setAree(j.aree); setErrore(""); setAggiornato(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }));
      if (selId) { const d = await richiestaOrmeggio(`/api/v1/ormeggio/permanenze/${selId}`); const v = await d.json(); if (seq === richiesta.current) { if (d.ok) setDettaglio(v); else { setErrore(v.error); setDettaglio(null); } } }
    } catch { if (seq === richiesta.current) setErrore("Connessione interrotta. Ricarica prima di operare."); }
  }, [selId]);
  useEffect(() => { setDettaglio(null); load(); return () => { richiesta.current++; }; }, [load]);
  useAggiornamenti(() => { if (!busy && !posto) return load(); }, ["ormeggio"]);
  const action = async (url: string, method: string, body: object) => {
    if (busy) return false;
    setBusy(true); setErrore("");
    try { const r = await richiestaOrmeggio(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) { setErrore(j.error); if (r.status === 409) await load(); return false; } await load(); segnalaCambiamento("ormeggio"); return true; }
    catch { setErrore("Connessione interrotta. Verifica i dati prima di riprovare."); return false; }
    finally { setBusy(false); }
  };
  const area = aree.find((a) => a.id === areaId) ?? aree[0];
  const liberi = aree.flatMap((a) => a.posti.filter((p) => !p.bloccato && !p.permanenza).map((p) => ({ ...p, areaNome: a.nome })));
  const onAssegna = async (p: Posto) => { setPosto(p); setBoatId(""); const r = await richiestaOrmeggio("/api/v1/ormeggio/barche-operative"); const j = await r.json(); if (r.ok) setBarche(j); else setErrore(j.error); };
  const onSposta = (p: Perm, posto: Posto) => action(`/api/v1/ormeggio/permanenze/${p.id}`, "PATCH", { azione: "sposta", postoId: posto.id, revisione: p.revisione });
  return <div className="grid gap-4"><div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl">{permanenzaId ? "Scheda operativa" : "Quadro posti"}</h1><span className="text-xs text-muted">{aggiornato && `Aggiornato alle ${aggiornato}`}</span><button className="btn-soft" disabled={busy} onClick={load}>Aggiorna</button></div>{errore && <Avviso tono="errore">{errore}</Avviso>}
    {dettaglio && <section className="card grid gap-3 p-4"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl">{dettaglio.boat.nome}</h2><p className="text-sm text-muted">{dettaglio.posto.codice} · {dettaglio.boat.tipo} · {dettaglio.pronta ? "Pronta" : "Da preparare"}</p></div>{!permanenzaId && <button className="text-sm font-bold text-ocean" onClick={() => { setSelId(""); setDettaglio(null); }}>Chiudi scheda</button>}</div><div className="flex flex-wrap gap-2">{(["uscita", "rientro"] as const).map((tipo) => <button disabled={busy} className="btn-soft" key={tipo} onClick={() => action("/api/v1/ormeggio/movimenti", "POST", { permanenzaId: dettaglio.id, tipo, revisione: dettaglio.revisione })}>{tipo === "uscita" ? "Registra uscita" : "Registra rientro"}</button>)}<button disabled={busy} className="btn-soft" onClick={() => action(`/api/v1/ormeggio/permanenze/${dettaglio.id}`, "PATCH", { azione: "aggiorna", pronta: !dettaglio.pronta, revisione: dettaglio.revisione })}>{dettaglio.pronta ? "Da preparare" : "Conferma pronta"}</button><Link className="btn-soft" href={`/gestionale/ormeggio/da-fare?barca=${encodeURIComponent(dettaglio.boat.nome)}`}>Le mie attività</Link></div><form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); if (await action(`/api/v1/ormeggio/permanenze/${dettaglio.id}`, "PATCH", { azione: "sposta", postoId: spostaId, revisione: dettaglio.revisione })) setSpostaId(""); }}><select className="campo" aria-label="Sposta al posto" required value={spostaId} onChange={(e) => setSpostaId(e.target.value)}><option value="">Sposta al posto…</option>{liberi.map((p) => <option key={p.id} value={p.id}>{p.areaNome} · {p.codice}</option>)}</select><button className="btn-primary" disabled={busy}>Sposta barca</button></form></section>}
    {!permanenzaId && <><select className="campo max-w-xs" aria-label="Area" value={area?.id ?? ""} onChange={(e) => setAreaId(e.target.value)}>{aree.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select>{area && <GrigliaPosti area={area} configura={false} busy={busy} trascinabile corrisponde={() => true} evidenza={() => undefined} onSeleziona={(p) => setSelId(p.id)} onAssegna={onAssegna} onToggleBlocco={() => {}} onSposta={onSposta} onErrore={setErrore} onTrascinamento={() => {}} />}</>}
    {posto && <Dialogo aperto onChiudi={() => { if (!busy) setPosto(null); }} titolo={`Assegna ${posto.codice}`}><form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); const b = barche.find((b) => b.id === boatId); if (b && await action("/api/v1/ormeggio/permanenze", "POST", { postoId: posto.id, boatId: b.id, proprietarioId: b.proprietarioId, inizioAt: oggi() })) setPosto(null); }}><p className="text-sm text-muted">Scegli una barca già registrata. Anagrafiche e condizioni economiche vengono gestite dal responsabile.</p><select required className="campo" aria-label="Barca da assegnare" value={boatId} onChange={(e) => setBoatId(e.target.value)}><option value="">Scegli barca…</option>{barche.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}</select>{errore && <p role="alert" className="text-sm text-coral">{errore}</p>}<button className="btn-primary" disabled={busy}>Assegna posto</button></form></Dialogo>}
  </div>;
}
