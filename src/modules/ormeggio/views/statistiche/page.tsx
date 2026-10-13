"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAggiornamenti } from "@/lib/aggiorna";
import { Avviso } from "@/components/ui/Avviso";
import { IntestazioneOrmeggio } from "@/modules/ormeggio/components/IntestazioneOrmeggio";
import { DettaglioStatistiche } from "@/modules/ormeggio/components/DettaglioStatistiche";
import { GraficoStatistiche } from "@/modules/ormeggio/components/GraficoStatistiche";
import { richiestaOrmeggio } from "@/modules/ormeggio/richiesta";
import { aggiungiGiorni, oggi } from "@/modules/piattaforma/date";
import { coloriSaldi, data, euro, nomiSaldi, numero, queryStatistiche } from "@/modules/ormeggio/statistiche/presentazione";
import type { CategoriaSaldo, TipoDettaglioStatistica } from "@/modules/ormeggio/statistiche/calcoli";
import type { DashboardStatistiche, FiltriStatistiche, SelezioneStatistica } from "@/modules/ormeggio/statistiche/presentazione";

function variazione(a: number | null, b: number | null, money: boolean) {
  if (a == null || b == null) return "Confronto non disponibile";
  if (a === 0 && b === 0) return "Nessuna variazione";
  const diff = a - b;
  if (b === 0) return `Variazione: ${money ? euro(diff) : numero(diff)}`;
  return `${diff > 0 ? "+" : ""}${numero(diff / Math.abs(b) * 100)}% rispetto al confronto`;
}

function Metrica({ titolo, valore, nota, confronto, tipo, onApri }: { titolo: string; valore: string; nota: string; confronto?: string; tipo: TipoDettaglioStatistica; onApri: (s: SelezioneStatistica) => void }) {
  return <article className="card min-w-0 overflow-hidden">
    <button className="flex h-full w-full flex-col items-start p-4 text-left transition-colors hover:bg-foam/60 focus-visible:outline-ocean sm:p-5" aria-label={`${titolo}: ${valore}. Apri dettaglio`} onClick={() => onApri({ tipo })}>
      <span className="text-sm font-semibold text-muted">{titolo}</span>
      <strong className="my-2 break-words text-3xl tracking-tight text-deep">{valore}</strong>
      <span className="text-xs leading-relaxed text-muted">{nota}</span>
      {confronto && <span className="mt-2 text-xs font-semibold text-ocean">{confronto}</span>}
      <span className="mt-auto pt-3 text-xs font-semibold text-ocean">Vedi dettaglio →</span>
    </button>
  </article>;
}

export default function StatistichePage() {
  const [filtri, setFiltri] = useState<FiltriStatistiche | null>(null);
  const [preset, setPreset] = useState("mese");
  const [confronto, setConfronto] = useState<"precedente" | "anno">("precedente");
  const [dashboard, setDashboard] = useState<DashboardStatistiche | null>(null);
  const [errore, setErrore] = useState("");
  const [caricamento, setCaricamento] = useState(false);
  const [selezione, setSelezione] = useState<SelezioneStatistica | null>(null);
  const [sort, setSort] = useState<"nome" | "occupazione" | "nettiCent" | "disponibili">("nettiCent");
  const [paginaAree, setPaginaAree] = useState(1);
  const sequenza = useRef(0);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search), day = oggi();
    setFiltri({ dal: p.get("dal") ?? `${day.slice(0, 7)}-01`, al: p.get("al") ?? day, areaId: p.get("areaId") ?? "", tipo: p.get("tipo") ?? "" });
    if (p.has("dal")) setPreset("personalizzato");
  }, []);
  const load = useCallback(async () => {
    if (!filtri) return;
    const seq = ++sequenza.current;
    setCaricamento(true);
    try {
      const r = await richiestaOrmeggio(`/api/v1/ormeggio/statistiche?${queryStatistiche(filtri)}`, { cache: "no-store" });
      const j = await r.json();
      if (seq !== sequenza.current) return;
      if (!r.ok) { setErrore(j.error ?? "Statistiche non disponibili"); setDashboard(null); setSelezione(null); return; }
      if (filtri.areaId !== j.areaIdEffettiva) {
        setFiltri((f) => f && { ...f, areaId: j.areaIdEffettiva });
        return;
      }
      setDashboard(j); setErrore("");
      setPaginaAree((p) => Math.min(p, Math.max(1, Math.ceil(j.aree.length / 10))));
    } catch {
      if (seq === sequenza.current) { setErrore("Connessione interrotta. Riprova per aggiornare i dati."); setDashboard(null); setSelezione(null); }
    } finally { if (seq === sequenza.current) setCaricamento(false); }
  }, [filtri]);
  useEffect(() => {
    const richieste = sequenza;
    setDashboard(null); setSelezione(null); setPaginaAree(1);
    if (filtri) window.history.replaceState(null, "", `?${queryStatistiche(filtri)}`);
    load();
    return () => { richieste.current++; };
  }, [filtri, load]);
  useAggiornamenti(load, ["ormeggio", "pagamenti"]);
  const chiudi = useCallback(() => setSelezione(null), []);
  const scegliPreset = (value: string) => {
    setPreset(value);
    if (!filtri || value === "personalizzato") return;
    const day = oggi(), month = `${day.slice(0, 7)}-01`;
    const al = value === "scorso" ? aggiungiGiorni(month, -1) : day;
    const dal = value === "anno" ? `${day.slice(0, 4)}-01-01` : value === "scorso" ? `${al.slice(0, 7)}-01` : month;
    setFiltri({ ...filtri, dal, al });
  };
  const m = dashboard?.metriche, prev = dashboard?.confronto[confronto].metriche;
  const delta = (key: "incassiCent" | "occupazione" | "contratti", money = true) => m && prev ? variazione(m[key], prev[key], money) : undefined;
  const righe = useMemo(() => [...(dashboard?.aree ?? [])].sort((a, b) => sort === "nome" ? a.nome.localeCompare(b.nome, "it") : (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity)), [dashboard, sort]);
  const giorni = dashboard ? Math.round((+new Date(dashboard.periodo.al) - +new Date(dashboard.periodo.dal)) / 86400000) + 1 : 1;
  const categorie = Object.keys(nomiSaldi) as CategoriaSaldo[];
  return <div className="grid min-w-0 gap-4">
    <IntestazioneOrmeggio titolo="Statistiche" indietro={false} />
    <p className="-mt-3 text-sm text-muted">Incassi, contratti e posti della tua struttura. Seleziona un numero per scoprirne il dettaglio.</p>
    {filtri && <div className="card flex flex-wrap items-end gap-3 p-3 text-sm">
      <label className="grid gap-1">Periodo<select className="campo" value={preset} onChange={(e) => scegliPreset(e.target.value)}><option value="mese">Questo mese</option><option value="scorso">Mese scorso</option><option value="anno">Quest’anno</option><option value="personalizzato">Personalizzato</option></select></label>
      <label className="grid gap-1">Dal<input className="campo max-w-40" type="date" value={filtri.dal} onChange={(e) => { setPreset("personalizzato"); setFiltri({ ...filtri, dal: e.target.value }); }} /></label>
      <label className="grid gap-1">Al<input className="campo max-w-40" type="date" value={filtri.al} onChange={(e) => { setPreset("personalizzato"); setFiltri({ ...filtri, al: e.target.value }); }} /></label>
      {dashboard && dashboard.areeFiltro.length > 1 && <label className="grid gap-1">Area<select className="campo max-w-48" value={filtri.areaId} onChange={(e) => setFiltri({ ...filtri, areaId: e.target.value })}><option value="">Tutte le aree attive</option>{dashboard.areeFiltro.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select></label>}
      <label className="grid gap-1">Servizio<select className="campo" value={filtri.tipo} onChange={(e) => setFiltri({ ...filtri, tipo: e.target.value })}><option value="">Tutti</option><option value="ormeggio_custodia">Ormeggio</option><option value="rimessaggio_custodia">Rimessaggio</option></select></label>
      <label className="grid gap-1">Confronta con<select className="campo" value={confronto} onChange={(e) => setConfronto(e.target.value as typeof confronto)}><option value="precedente">Periodo precedente, stessa durata</option><option value="anno">Stesso periodo dell’anno scorso</option></select></label>
      <button className="btn-soft" disabled={caricamento} onClick={load}>{caricamento ? "Aggiornamento…" : "Aggiorna"}</button>
    </div>}
    {errore && <Avviso tono="errore" azione={<button className="btn-soft" onClick={load}>Riprova</button>}>{errore}</Avviso>}
    {caricamento && !dashboard && <p role="status" className="card p-8 text-center text-muted">Calcolo delle statistiche…</p>}
    {dashboard && m && <>
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted"><span>{data(dashboard.periodo.dal)} – {data(dashboard.periodo.al)} · Confronto: {data(dashboard.confronto[confronto].periodo.dal)} – {data(dashboard.confronto[confronto].periodo.al)}</span><span>{caricamento ? "Aggiornamento…" : `Aggiornato alle ${new Date(dashboard.aggiornatoAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })}`}</span></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metrica titolo="Incassi netti" valore={euro(m.incassiCent)} nota="Pagamenti ricevuti meno rimborsi nel periodo. Cauzioni escluse." confronto={delta("incassiCent")} tipo="incassi" onApri={setSelezione} />
        <Metrica titolo="Da incassare" valore={euro(m.residuoCent)} nota="Saldo ancora da pagare sui contratti presenti nel periodo, aggiornato a oggi." tipo="residui" onApri={setSelezione} />
        <Metrica titolo="Occupazione posti" valore={m.occupazione == null ? "—" : `${numero(m.occupazione)}%`} nota={m.disponibili ? `In media ${numero(m.riservati / giorni)} posti riservati su ${numero(m.disponibili / giorni)} disponibili nel periodo.` : "Nessun posto disponibile nel periodo scelto."} confronto={delta("occupazione", false)} tipo="occupazione" onApri={setSelezione} />
        <Metrica titolo="Contratti iniziati" valore={numero(m.contratti, 0)} nota="Permanenze iniziate nel periodo scelto. Contratti annullati esclusi." confronto={delta("contratti", false)} tipo="contratti" onApri={setSelezione} />
      </div>
      {dashboard.copertura.pagamentiSenzaData > 0 && <Avviso tono="attenzione">{dashboard.copertura.pagamentiSenzaData} movimenti senza data: il totale degli incassi non è disponibile. Il grafico e il dettaglio mostrano quelli con data certa.</Avviso>}
      <div className="grid auto-rows-fr items-stretch gap-4 xl:grid-cols-3">
        <section className="card flex h-full min-w-0 flex-col p-4 sm:p-5">
          <div className="min-h-32"><h2 className="text-lg">Situazione dei contratti</h2>
          <p className="mt-1 text-sm text-muted">Come sono pagati oggi i {dashboard.totaleCoorte} contratti presenti nel periodo.</p>
          </div>
          {dashboard.totaleCoorte > 0 ? <div className="relative mx-auto h-48 w-48 max-w-full">
            <svg viewBox="0 0 200 200" className="h-full w-full" role="img" aria-label={`Saldati ${dashboard.donut.saldati}, parzialmente saldati ${dashboard.donut.parziali}, da saldare ${dashboard.donut.da_saldare}`}>
              <circle cx="100" cy="100" r="75" fill="none" stroke="#e8eff0" strokeWidth="27" />
              {categorie.map((c, i) => { const start = categorie.slice(0, i).reduce((s, k) => s + dashboard.donut[k], 0) / dashboard.totaleCoorte * 471.239; return dashboard.donut[c] > 0 && <circle key={c} cx="100" cy="100" r="75" fill="none" stroke={coloriSaldi[c]} strokeWidth="27" strokeDasharray={`${dashboard.donut[c] / dashboard.totaleCoorte * 471.239} 471.239`} strokeDashoffset={-start} transform="rotate(-90 100 100)" className="cursor-pointer transition-opacity hover:opacity-70 focus:outline-ocean" role="button" tabIndex={0} aria-label={`${nomiSaldi[c]}: ${dashboard.donut[c]}. Apri dettaglio`} onClick={() => setSelezione({ tipo: c })} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelezione({ tipo: c }); } }}><title>{nomiSaldi[c]}: {dashboard.donut[c]} · Apri dettaglio</title></circle>; })}
            </svg>
            <div className="pointer-events-none absolute inset-0 grid place-content-center text-center"><strong className="text-4xl text-deep">{dashboard.totaleCoorte}</strong><span className="text-xs text-muted">contratti nel periodo</span></div>
          </div> : <p className="grid h-48 place-items-center text-center text-muted">Nessun contratto nel periodo selezionato.</p>}
          <div className="mt-auto grid gap-2 pt-4">{categorie.map((c) => <button key={c} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-foam focus-visible:outline-ocean" onClick={() => setSelezione({ tipo: c })}><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full" style={{ background: coloriSaldi[c] }} />{nomiSaldi[c]}</span><b>{dashboard.donut[c]} →</b></button>)}</div>
        </section>
        <GraficoStatistiche serie={dashboard.serie} onDettaglio={setSelezione} />
        <GraficoStatistiche serie={dashboard.serie} occupazione onDettaglio={setSelezione} />
      </div>
      {(m.occupazione != null && m.occupazione > 100.000001 || dashboard.serie.some((s) => s.occupazione != null && s.occupazione > 100.000001)) && <Avviso tono="attenzione">L’occupazione supera il 100%: verifica assegnazioni e posti disponibili.</Avviso>}
      {dashboard.areeFiltro.length > 1 && <section className="card min-w-0 overflow-hidden p-4 sm:p-5">
        <h2 className="text-lg">Resa per area</h2>
        <p className="mb-3 mt-1 text-xs text-muted">Confronta incassi e occupazione delle aree ancora presenti nel profilo. Seleziona un’area per approfondire.</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[540px] text-sm"><thead><tr className="border-b border-line text-left text-xs text-muted">
          {([["nome", "Area"], ["nettiCent", "Incassi netti"], ["occupazione", "Occupazione"], ["disponibili", "Posti disponibili in media"]] as const).map(([k, n]) => <th key={k} className="p-3"><button className="font-semibold" onClick={() => { setSort(k); setPaginaAree(1); }}>{n}{sort === k ? k === "nome" ? " ↑" : " ↓" : " ↕"}</button></th>)}
        </tr></thead><tbody>{righe.slice((paginaAree - 1) * 10, paginaAree * 10).map((a) => <tr key={a.id} className="border-b border-line/60"><td className="p-3 font-semibold"><button className="text-left text-ocean underline underline-offset-4" onClick={() => filtri && setFiltri({ ...filtri, areaId: a.id })}>{a.nome}</button></td><td className="p-3">{euro(a.nettiCent)}</td><td className="p-3">{a.occupazione == null ? "—" : `${numero(a.occupazione)}%`}</td><td className="p-3">{numero(a.disponibili / giorni)}</td></tr>)}</tbody></table></div>
        {righe.length > 10 && <div className="mt-3 flex items-center justify-end gap-3 text-sm"><button className="btn-soft" disabled={paginaAree === 1} onClick={() => setPaginaAree(paginaAree - 1)}>Precedenti</button><span>{paginaAree} / {Math.ceil(righe.length / 10)}</span><button className="btn-soft" disabled={paginaAree * 10 >= righe.length} onClick={() => setPaginaAree(paginaAree + 1)}>Successive</button></div>}
        <p className="mt-3 text-xs text-muted">Gli incassi sono attribuiti all’area assegnata alla data del pagamento o del rimborso.{!filtri?.areaId && ` Incassi relativi ad aree rimosse o senza posto assegnato: ${euro(dashboard.serie.reduce((s, r) => s + r.nettiCent, 0) - righe.reduce((s, r) => s + r.nettiCent, 0))}. Sono conservati nel totale generale.`}</p>
      </section>}
      {dashboard.areeFiltro.length === 1 && <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted">Area attiva: <b className="text-deep">{dashboard.areeFiltro[0].nome}</b>. L’occupazione riguarda i posti di quest’area.</p>}
      {dashboard.areeFiltro.length === 0 && <Avviso tono="info">Non ci sono aree attive nel profilo. Gli incassi e i contratti già registrati restano consultabili.</Avviso>}
      <details className="card p-4 text-sm text-muted"><summary className="cursor-pointer font-semibold text-deep">Come leggere questi numeri</summary><div className="mt-3 grid gap-3">
        <p><b>Periodo:</b> comprende tutto il giorno iniziale e finale. Incassi e contratti iniziati si riferiscono a queste date; gli importi da incassare indicano il saldo attuale dei contratti presenti nel periodo.</p>
        <p><b>Aree:</b> filtri, confronto e occupazione seguono le aree presenti nel profilo. Rimuovere un’area conserva i pagamenti e i contratti già registrati nel totale generale.</p>
        <p><b>Occupazione:</b> {dashboard.baseCapacita} I posti disponibili e riservati sono mostrati come media giornaliera nel periodo.</p>
        <p><b>Incassi netti:</b> pagamenti ricevuti meno rimborsi. Non rappresentano l’utile: costi, IVA e commissioni non vengono sottratti. Cauzioni escluse: ricevute {euro(dashboard.copertura.cauzioniRicevuteCent)}, rimborsate {euro(dashboard.copertura.cauzioniRimborsateCent)}.</p>
        <p><b>Da incassare:</b> addebiti meno incassi confermati, al netto dei rimborsi riusciti e con cauzioni escluse, come in Economia. Eventuali crediti sono separati: {euro(m.creditoCent)}.</p>
        <p>I dati si aggiornano automaticamente ogni dieci secondi e quando torni sulla pagina. Puoi anche usare Aggiorna.</p>
      </div></details>
    </>}
    {selezione && filtri && dashboard && <DettaglioStatistiche key={`${selezione.tipo}-${selezione.dal ?? ""}-${selezione.al ?? ""}`} selezione={selezione} filtri={filtri} aggiornatoAt={dashboard.aggiornatoAt} onChiudi={chiudi} />}
  </div>;
}
