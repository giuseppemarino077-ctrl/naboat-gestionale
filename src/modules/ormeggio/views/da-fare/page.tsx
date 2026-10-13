"use client";
import { richiestaOrmeggio } from "@/modules/ormeggio/richiesta";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUtente } from "@/components/Utente";
import { Icona } from "@/components/ui/Icona";
import { useConferma } from "@/components/ui/Dialogo";
import { Avviso } from "@/components/ui/Avviso";
import { IntestazioneOrmeggio, RiepilogoOrmeggio } from "@/modules/ormeggio/components/IntestazioneOrmeggio";
import { AccessoAttivita } from "@/modules/ormeggio/components/AccessoAttivita";
import { CatalogoServizi } from "@/modules/ormeggio/components/CatalogoServizi";
import { useCatalogoServizi } from "@/modules/ormeggio/use-catalogo-servizi";
import { useAggiornamenti, segnalaCambiamento } from "@/lib/aggiorna";
import { oggi as giornoCorrente } from "@/modules/piattaforma/date";
import { attivitaInRitardo, ordinaAttivita, puoCambiareStato, STATI_ATTIVITA, type AttivitaOperativa, type OrdineAttivita, type StatoAttivita } from "@/modules/ormeggio/attivita";
import { ElencoAttivita, KanbanAttivita } from "@/modules/ormeggio/components/LavoriAttivita";

export default function DaFarePage() {
  const [attivita, setAttivita] = useState<AttivitaOperativa[]>([]);
  const [archiviate, setArchiviate] = useState<AttivitaOperativa[]>([]);
  const [sezione, setSezione] = useState<"correnti" | "completate">("correnti");
  const [err, setErr] = useState("");
  const [caricamento, setCaricamento] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [stato, setStato] = useState("");
  const [mie, setMie] = useState(false);
  const [vista, setVista] = useState<"lista" | "kanban">("lista");
  const [ordine, setOrdine] = useState<OrdineAttivita>("giorno");
  const richiesta = useRef(0);
  const [vistaCaricata, setVistaCaricata] = useState("");
  const [msg, setMsg] = useState("");
  const [limiteAperte, setLimiteAperte] = useState(false);
  const [limiteCompletate, setLimiteCompletate] = useState(false);
  const [limiteArchiviate, setLimiteArchiviate] = useState(false);
  const utente = useUtente();
  const conferma = useConferma();
  const chiaveVista = utente ? `nb_ormeggio_attivita_vista:${utente.tenantId}:${utente.id}` : "";
  const vistaPronta = !!chiaveVista && vistaCaricata === chiaveVista;
  useEffect(() => {
    if (!chiaveVista) return;
    let salvata: string | null = null;
    try { salvata = localStorage.getItem(chiaveVista); } catch {}
    setVista(salvata === "kanban" ? "kanban" : "lista");
    let ordineSalvato: string | null = null;
    try { ordineSalvato = localStorage.getItem(`${chiaveVista}:ordine`); } catch {}
    setOrdine(ordineSalvato === "priorita" ? "priorita" : "giorno");
    setVistaCaricata(chiaveVista);
  }, [chiaveVista]);
  const selezionaVista = (v: "lista" | "kanban") => {
    setVista(v);
    try { localStorage.setItem(chiaveVista, v); } catch {}
  };
  const selezionaOrdine = (v: OrdineAttivita) => {
    setOrdine(v);
    try { localStorage.setItem(`${chiaveVista}:ordine`, v); } catch {}
  };
  const catalogo = useCatalogoServizi();
  const carica = useCallback(async () => {
    const numeroRichiesta = ++richiesta.current;
    try {
      const liste = await Promise.all(["daFare=1", "stato=completato&completate=attuali", "stato=completato&completate=archiviate"].map(async (filtro) => {
        const r = await richiestaOrmeggio(`/api/v1/ormeggio/attivita?${filtro}&ordine=${ordine}`);
        const j = await r.json();
        if (!r.ok || !Array.isArray(j)) throw new Error(j.error ?? "Non riesco a leggere le attività.");
        return j as AttivitaOperativa[];
      }));
      if (numeroRichiesta !== richiesta.current) return;
      setAttivita([...new Map(liste.slice(0, 2).flat().map((a) => [a.id, a])).values()]);
      setArchiviate(liste[2]);
      setLimiteAperte(liste[0].length >= 200);
      setLimiteCompletate(liste[1].length >= 200);
      setLimiteArchiviate(liste[2].length >= 200);
    } catch (e) { if (numeroRichiesta === richiesta.current) setErr(e instanceof Error && !(e instanceof TypeError) ? e.message : "Connessione interrotta. Riprova."); }
    finally { if (numeroRichiesta === richiesta.current) setCaricamento(false); }
  }, [ordine]);
  useEffect(() => { carica(); }, [carica]);
  useAggiornamenti(() => { if (!busy) return carica(); }, ["ormeggio"]);
  const salva = async (a: AttivitaOperativa, patch: Record<string, unknown>, messaggio: string) => {
    if (busy) return false;
    setBusy(a.id); setErr(""); setMsg("");
    try {
      const r = await richiestaOrmeggio(`/api/v1/ormeggio/attivita/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...patch, revisione: a.revisione }) });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? "Operazione non riuscita."); return false; }
      await carica(); segnalaCambiamento("ormeggio");
      setMsg(messaggio);
      return true;
    } catch { setErr("Connessione interrotta: aggiorna l’elenco prima di riprovare."); return false; }
    finally { setBusy(null); }
  };
  const cambia = async (a: AttivitaOperativa, nuovoStato: StatoAttivita) => {
    if (busy || !puoCambiareStato(a, nuovoStato, utente?.vedeImporti === true)) return;
    const storno = a.stato === "completato" && a.contabilizzata && nuovoStato !== "completato";
    if (storno && !await conferma.chiedi({ titolo: "Stornare e riaprire l’attività?", messaggio: `L’addebito di «${a.tipo}» viene rimosso e il lavoro torna in «${STATI_ATTIVITA.find((s) => s.valore === nuovoStato)?.nome}».`, confermaLabel: "Storna e riapri", pericoloso: true })) return;
    await salva(a, { stato: nuovoStato, ...(storno ? { storno: true } : {}) }, `Attività «${a.tipo}»: ${STATI_ATTIVITA.find((s) => s.valore === nuovoStato)?.nome}.`);
  };
  const oggi = giornoCorrente();
  const archivio = sezione === "completate";
  const elenco = archivio ? archiviate : attivita;
  const visibili = ordinaAttivita(elenco.filter((a) => (archivio || !stato || (stato === "aperte" ? a.stato !== "completato" : a.stato === stato)) && (!mie || a.addetto?.id === utente?.id) && `${a.tipo} ${a.permanenza.boat.nome} ${a.permanenza.boat.proprietario?.nome ?? ""} ${a.permanenza.posto?.codice ?? ""} ${a.addetto?.nome ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())), ordine);
  const lavoriProps = {
    attivita: visibili, oggi, busy, ordine,
    puoModificare: utente?.role === "owner" || utente?.role === "operatore" || utente?.role === "superadmin",
    vedeImporti: utente?.vedeImporti === true,
    vuoto: caricamento ? "Carico le attività…" : err ? "Elenco non disponibile." : elenco.length ? "Nessuna attività corrisponde ai filtri." : archivio ? "Nessuna attività completata nei giorni passati." : "Nessuna attività da mostrare. Apri le attività di una barca per aggiungere un lavoro.",
    onCambia: cambia,
    onPriorita: (a: AttivitaOperativa, priorita: number) => salva(a, { priorita }, `Priorità di «${a.tipo}» aggiornata.`),
    onNote: (a: AttivitaOperativa, note: string | null) => salva(a, { note }, `Note di «${a.tipo}» aggiornate.`),
  };
  return (
    <div className="grid min-w-0 gap-3">
      <IntestazioneOrmeggio titolo="Attività" descrizione="Organizza i lavori da fare, segui quelli in corso e consulta i completati." azioni={<button className="btn-soft" disabled={!!busy} onClick={() => { setErr(""); carica(); }}>Aggiorna</button>} />
      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}
      <RiepilogoOrmeggio voci={[
        { nome: "Da fare", valore: attivita.filter((a) => a.stato === "da_fare").length },
        { nome: "In corso", valore: attivita.filter((a) => a.stato === "in_corso").length },
        { nome: "Completato", valore: attivita.filter((a) => a.stato === "completato").length },
        { nome: "In ritardo", valore: attivita.filter((a) => attivitaInRitardo(a, oggi)).length },
      ]} />
      <div role="group" aria-label="Sezione attività" className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl border border-ocean/20 bg-foam p-1">
        {(["correnti", "completate"] as const).map((v) => <button key={v} type="button" aria-pressed={sezione === v} disabled={!!busy} className={`rounded-lg px-3 py-2 text-sm font-semibold ${sezione === v ? "bg-ocean text-white shadow-sm" : "text-ocean hover:bg-white"}`} onClick={() => setSezione(v)}>{v === "correnti" ? "Attività" : "Attività completate"}</button>)}
      </div>
      {archivio && <p className="text-sm text-muted">Archivio delle attività completate dei giorni passati. Apri una card per consultare le note o riaprire il lavoro.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Cerca attività" className="campo min-w-[180px] flex-1" placeholder="Cliente, barca, posto, lavoro o addetto…" value={q} onChange={(e) => setQ(e.target.value)} />
        {!archivio && <select aria-label="Stato attività" className="campo !w-auto" value={stato} onChange={(e) => setStato(e.target.value)}><option value="">Tutti gli stati</option><option value="aperte">Da fare e in corso</option><option value="da_fare">Da fare</option><option value="in_corso">In corso</option><option value="completato">Completato</option></select>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mie} onChange={(e) => setMie(e.target.checked)} /> Assegnate a me</label>
        <div role="group" aria-label="Ordine attività" className="flex rounded-xl border border-ocean/20 bg-foam p-1">
          {(["giorno", "priorita"] as const).map((v) => <button key={v} type="button" aria-label={v === "giorno" ? "Ordina per giorno" : "Ordina per priorità"} aria-pressed={ordine === v} disabled={!vistaPronta || !!busy} className={`flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${ordine === v ? "bg-ocean text-white shadow-sm" : "text-ocean hover:bg-white"}`} onClick={() => selezionaOrdine(v)}><Icona nome={v === "giorno" ? "calendario" : "stella"} className="h-3.5 w-3.5" />{v === "giorno" ? "Giorno" : "Priorità"}</button>)}
        </div>
        {!archivio && <div role="group" aria-label="Vista attività" className="flex rounded-xl border border-line bg-white p-1">
          {(["lista", "kanban"] as const).map((v) => <button key={v} type="button" title={v === "lista" ? "Lista" : "Kanban"} aria-label={v === "lista" ? "Vista Lista" : "Vista Kanban"} aria-pressed={vista === v} disabled={!vistaPronta} className={`flex min-h-8 min-w-9 items-center justify-center rounded-lg px-3 py-1.5 text-sm font-semibold ${vista === v ? "bg-deep text-white" : "text-muted hover:bg-foam"}`} onClick={() => selezionaVista(v)}>{v === "lista" ? "Lista" : <Icona nome="kanban" className="h-5 w-5" />}</button>)}
        </div>}
      </div>
      {!vistaPronta ? <p className="text-sm text-muted">Carico le attività…</p> : archivio || vista === "lista" ? <ElencoAttivita {...lavoriProps} /> : <KanbanAttivita {...lavoriProps} />}
      {(archivio ? limiteArchiviate : limiteAperte || limiteCompletate) && <p className="text-xs text-muted">{archivio ? "Mostrate le ultime 200 attività archiviate. " : <>{limiteAperte && "Mostrate le prime 200 attività aperte. "}{limiteCompletate && "Mostrate le prime 200 attività completate di oggi o dei prossimi giorni. "}</>}Consulta le singole schede per il dettaglio completo.</p>}
      {(utente?.role === "owner" || utente?.ruoloOrmeggio === "responsabile") && <><details className="min-w-0" data-sezione-attivita="catalogo">
        <summary className="card cursor-pointer px-4 py-3 font-semibold text-deep">Servizi e attività offerte</summary>
        <div className="mt-2"><CatalogoServizi catalogo={catalogo} tendina mostraTitolo={false} /></div>
      </details>
      {conferma.dialogo}
      <details className="min-w-0" data-sezione-attivita="barca">
        <summary id="accesso-attivita" className="card cursor-pointer px-4 py-3 font-semibold text-deep">Apri le attività di una barca</summary>
        <div className="mt-2"><AccessoAttivita mostraTitolo={false} /></div>
      </details></>}
    </div>
  );
}
