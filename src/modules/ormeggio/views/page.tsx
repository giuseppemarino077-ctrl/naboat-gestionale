"use client";
import { richiestaOrmeggio } from "@/modules/ormeggio/richiesta";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { OperazioniAddetto } from "@/modules/ormeggio/components/OperazioniAddetto";
import { useUtente } from "@/components/Utente";
import { IntestazioneOrmeggio } from "@/modules/ormeggio/components/IntestazioneOrmeggio";
import { RiepilogoPosti } from "@/modules/ormeggio/components/RiepilogoPosti";
import { Dialogo } from "@/components/ui/Dialogo";
import { useAggiornamenti, segnalaCambiamento } from "@/lib/aggiorna";
import { Avviso } from "@/components/ui/Avviso";
import { Icona } from "@/components/ui/Icona";
import { Combo } from "@/components/ui/Combo";
import { useConferma } from "@/components/ui/Dialogo";
import { GrigliaPosti } from "@/modules/ormeggio/components/GrigliaPosti";
import { SchedaPosto, type DettaglioPosto } from "@/modules/ormeggio/components/SchedaPosto";
import type { Area, Perm, Posto, Stato } from "@/modules/ormeggio/components/tipi-griglia";
import { codiceDaTesto } from "@/modules/piattaforma/barche";
import { OPZIONI_TIPI } from "@/modules/piattaforma/tipi-barche";
import { aggiungiGiorni, fineGiorno, inizioGiorno, oggi } from "@/modules/piattaforma/date";
import { useCatalogoServizi } from "@/modules/ormeggio/use-catalogo-servizi";
import { centDaEuro, euroCampo, preventivoSosta, tariffaSosta } from "@/modules/ormeggio/tariffe";
import { evidenzaPosto, type CategoriaPosti } from "@/modules/ormeggio/evidenza-posti";

type Griglia = {
  aree: Area[];
  fuoriGriglia: { id: string; boatNome: string; proprietario: string | null; areaNome: string; postoCodice: string; motivo: string }[];
  riepilogo: { totale: number; liberi: number; occupati: number; nonUsabili: number; daSistemare: number; bloccate: number };
};

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

// Form di assegnazione sempre pulito: senza azzerarlo, i dati del proprietario o
// della barca precedente restano compilati e l'API riusa il vecchio proprietario.
function formAssegnazione() {
  return {
    propMode: "esistente", proprietarioId: "", propNome: "", propTelefono: "",
    barcaMode: "esistente", boatId: "", barcaNome: "", barcaTipo: "", barcaTipoCodice: "",
    tipo: "ormeggio_custodia", corrispettivoEuro: null as string | null, inizioAt: oggi(), finePrevistaAt: "", note: "",
  };
}

// Colori di stato: restano quelli del portale (verde = a posto, ambra = da fare,
// arancio = in mare, corallo = bloccata). Forme e palette invariate.
const STILE: Record<Stato, string> = {
  in_sosta: "border-[#a9e0d0] bg-[#d8f3ea] text-[#177469]",
  da_fare: "border-[#f0d59a] bg-[#fff0cc] text-[#9a6406]",
  in_mare: "border-[#8fddd5] bg-[#e1f5f2] text-deep",
  bloccata: "border-[#f6c9be] bg-[#fdeeea] text-coral",
};
const NOME_STATO: Record<Stato, string> = {
  in_sosta: "Al posto",
  da_fare: "Da fare",
  in_mare: "In mare: posto assegnato",
  bloccata: "Non disponibile",
};

function QuadroOperativo() {
  const [griglia, setGriglia] = useState<Griglia | null>(null);
  const [data, setData] = useState(oggi());
  const [ricerca, setRicerca] = useState("");
  const [areaId, setAreaId] = useState("");
  const [vista, setVista] = useState<"griglia" | "elenco">("griglia");
  const [configura, setConfigura] = useState(false);
  const [areaForm, setAreaForm] = useState({ id: "", nome: "", righe: 4, colonne: 6 });
  const [erroreCaricamento, setErroreCaricamento] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const conferma = useConferma();
  const [postoScelto, setPostoScelto] = useState<Posto | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [dettaglio, setDettaglio] = useState<DettaglioPosto | null>(null);
  const [erroreDettaglio, setErroreDettaglio] = useState("");
  const [tentativoDettaglio, setTentativoDettaglio] = useState(0);
  const [tab, setTab] = useState<"scheda" | "attivita" | "conto">("scheda");
  const [move, setMove] = useState({ aperto: false, postoId: "", decorrenza: "" });
  const utente = useUtente();
  const vedeImporti = utente?.vedeImporti === true;
  const catalogo = useCatalogoServizi();
  const [stato, setStato] = useState("tutti");
  const [categoriaPosti, setCategoriaPosti] = useState<CategoriaPosti | null>(null);
  const [anteprimaPosti, setAnteprimaPosti] = useState<CategoriaPosti | null>(null);
  const [busy, setBusy] = useState(false);
  const [trascinamento, setTrascinamento] = useState(false);
  const [mostraDaSistemare, setMostraDaSistemare] = useState(false);
  const chiudiDaSistemare = useCallback(() => setMostraDaSistemare(false), []);
  const [legenda, setLegenda] = useState(false);
  const [pannelloLaterale, setPannelloLaterale] = useState(false);
  const chiudiSelezione = useCallback(() => setSelId(null), []);
  const pannelloRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const aggiorna = () => setPannelloLaterale(media.matches);
    aggiorna(); media.addEventListener("change", aggiorna);
    return () => media.removeEventListener("change", aggiorna);
  }, []);
  useEffect(() => {
    if (!selId || !pannelloLaterale) return;
    const frame = requestAnimationFrame(() => {
      const pannello = pannelloRef.current;
      if (!pannello) return;
      const posizione = pannello.getBoundingClientRect();
      if (posizione.top > 16 && posizione.bottom > window.innerHeight) pannello.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [selId, pannelloLaterale]);
  const [caricamento, setCaricamento] = useState(true);
  const richiesta = useRef(0);
  const [proprietari, setProprietari] = useState<any[]>([]);
  const [barche, setBarche] = useState<any[]>([]);
  const [nuovaArea, setNuovaArea] = useState({ nome: "", righe: 4, colonne: 6 });
  const [form, setForm] = useState(formAssegnazione());
  const tariffaMensileCent = vedeImporti ? tariffaSosta(catalogo.servizi, "mensile")?.prezzoCent ?? null : null;
  const tariffaGiornalieraCent = vedeImporti ? tariffaSosta(catalogo.servizi, "giornaliera")?.prezzoCent ?? null : null;
  const preventivo = preventivoSosta(form.inizioAt, form.finePrevistaAt, tariffaGiornalieraCent, tariffaMensileCent);
  const corrispettivoEuro = form.corrispettivoEuro ?? euroCampo(preventivo.importoCent);

  const carica = useCallback(async () => {
    const seq = ++richiesta.current;
    try {
      const r = await richiestaOrmeggio(`/api/v1/ormeggio/griglia?data=${data}`);
      const j = await r.json().catch(() => ({}));
      if (seq !== richiesta.current) return;
      if (!r.ok) { setErroreCaricamento(j.error ?? "Non riesco a caricare i posti."); return; }
      setErroreCaricamento("");
      setGriglia(j);
    } catch { if (seq === richiesta.current) setErroreCaricamento("Connessione interrotta. Riprova a caricare il quadro."); }
    finally { if (seq === richiesta.current) setCaricamento(false); }
  }, [data]);
  useEffect(() => { setCaricamento(true); setSelId(null); carica(); }, [carica]);
  useAggiornamenti(() => { if (postoScelto || move.aperto || busy || trascinamento || configura) return; return carica(); }, ["ormeggio"]);
  const caricaElenchi = () => {
    richiestaOrmeggio("/api/v1/ormeggio/proprietari").then((r) => r.json()).then((j) => Array.isArray(j) && setProprietari(j)).catch(() => {});
    richiestaOrmeggio("/api/v1/ormeggio/barche").then((r) => r.json()).then((j) => Array.isArray(j) && setBarche(j)).catch(() => {});
  };
  useEffect(() => {
    caricaElenchi();
    setRicerca(new URLSearchParams(window.location.search).get("q") ?? "");

  }, []);

  const chiama = async (url: string, method: string, body?: any) => {
    if (busy) return null;
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await richiestaOrmeggio(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Operazione non riuscita."); if (r.status === 409) await carica(); return null; }
      await carica();
      segnalaCambiamento("ormeggio");
      return j;
    } catch { setErr("Connessione interrotta: verifica il quadro prima di riprovare."); return null; }
    finally { setBusy(false); }
  };

  const eliminaArea = async (area: any) => {
    const ok = await conferma.chiedi({
      titolo: `Eliminare l'area "${area.nome}"?`,
      messaggio: "L'area e i suoi posti verranno rimossi dalla griglia.",
      dettaglio: "Barche, soste, storico e conti restano disponibili. Le barche presenti nei posti rimossi compariranno in «Barche fuori griglia», da cui potrai assegnarle a un nuovo posto.",
      confermaLabel: "Elimina area",
      pericoloso: true,
    });
    if (ok) { const j = await chiama(`/api/v1/ormeggio/aree/${area.id}`, "DELETE"); if (j) { setSelId(null); setMsg(`Griglia «${area.nome}» rimossa. Storico e conti conservati.`); } }
  };

  const aree = useMemo(() => griglia?.aree ?? [], [griglia]);  const areaSelezionata: Area | undefined = aree.find((a) => a.id === areaId) ?? aree[0];
  useEffect(() => { if (aree[0] && !aree.some((a) => a.id === areaId)) setAreaId(aree[0].id); }, [aree, areaId]);

  useEffect(() => {
    if (configura && areaSelezionata && areaForm.id !== areaSelezionata.id) setAreaForm({ id: areaSelezionata.id, nome: areaSelezionata.nome, righe: areaSelezionata.righe, colonne: areaSelezionata.colonne });
  }, [configura, areaSelezionata, areaForm.id]);

  const configuraArea = (area: Area) => setAreaForm({ id: area.id, nome: area.nome, righe: area.righe, colonne: area.colonne });
  const salvaArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!areaSelezionata || areaForm.id !== areaSelezionata.id) return;
    const j = await chiama(`/api/v1/ormeggio/aree/${areaForm.id}`, "PATCH", { nome: areaForm.nome.trim(), righe: Number(areaForm.righe), colonne: Number(areaForm.colonne) });
    if (j) { setAreaForm({ id: j.id, nome: j.nome, righe: j.righe, colonne: j.colonne }); setMsg(`Griglia «${j.nome}» aggiornata.`); }
  };

  const tuttiPosti = useMemo(() => aree.flatMap((a) => a.posti.map((p) => ({ ...p, areaNome: a.nome }))), [aree]);
  const postoSelezionato = tuttiPosti.find((p) => p.permanenza?.id === selId) ?? null;
  const sel: Perm | null = postoSelezionato?.permanenza ?? null;

  useEffect(() => {
    setErroreDettaglio("");
    if (!selId) { setDettaglio(null); return; }
    const controller = new AbortController();
    richiestaOrmeggio(`/api/v1/ormeggio/permanenze/${selId}`, { signal: controller.signal }).then(async (r) => {
      const j = await r.json();
      if (controller.signal.aborted) return;
      if (!r.ok) { setDettaglio(null); setErroreDettaglio(j.error ?? "Scheda non disponibile."); return; }
      setDettaglio(j);
    }).catch(() => { if (!controller.signal.aborted) { setDettaglio(null); setErroreDettaglio("Non riesco ad aggiornare la scheda del posto."); } });
    return () => controller.abort();
  }, [selId, griglia, tentativoDettaglio]);

  const q = ricerca.trim().toLowerCase();
  const evidenza = (posto: Posto) => evidenzaPosto(posto, categoriaPosti, anteprimaPosti);
  const corrisponde = (posto: Posto) =>
    (stato === "tutti" || (stato === "libero" ? !posto.bloccato && !posto.permanenza : stato === "non_usabile" ? posto.bloccato : posto.permanenza?.statoGriglia === stato)) &&
    (!q || posto.codice.toLowerCase().includes(q) || (posto.permanenza?.boatNome ?? "").toLowerCase().includes(q) || (posto.permanenza?.proprietario ?? "").toLowerCase().includes(q));

  const toggleBlocco = (posto: Posto) => chiama(`/api/v1/ormeggio/posti/${posto.id}`, "PATCH", { bloccato: !posto.bloccato }).then((j) => j && setMsg(posto.bloccato ? "Posto riabilitato." : "Posto segnato come non utilizzabile."));

  const creaArea = async (e: React.FormEvent) => {
    e.preventDefault();
    const j = await chiama("/api/v1/ormeggio/aree", "POST", { nome: nuovaArea.nome, righe: Number(nuovaArea.righe), colonne: Number(nuovaArea.colonne) });
    if (j) { setAreaId(j.id); configuraArea(j); setMsg("Area creata."); setNuovaArea({ nome: "", righe: 4, colonne: 6 }); }
  };

  const assegna = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postoScelto) return;
    if (preventivo.stato === "date_non_valide") { setErr(preventivo.messaggio); return; }
    let corrispettivoCent: number | null = null;
    try { if (vedeImporti) corrispettivoCent = centDaEuro(corrispettivoEuro); }
    catch (e) { setErr(e instanceof Error ? e.message : "Corrispettivo non valido."); return; }
    const body: any = {
      postoId: postoScelto.id, tipo: form.tipo,
      inizioAt: form.inizioAt === oggi() ? form.inizioAt : inizioGiorno(form.inizioAt).toISOString(),
      finePrevistaAt: form.finePrevistaAt ? fineGiorno(form.finePrevistaAt).toISOString() : null,
      corrispettivoCent,
      note: form.note || null,
    };
    if (form.propMode === "esistente") body.proprietarioId = form.proprietarioId;
    else body.nuovoProprietario = { nome: form.propNome, telefono: form.propTelefono || null };
    if (form.barcaMode === "esistente") body.boatId = form.boatId;
    else body.nuovaBarca = { nome: form.barcaNome, tipo: form.barcaTipo || null, tipoCodice: form.barcaTipoCodice || null };
    const j = await chiama("/api/v1/ormeggio/permanenze", "POST", body);
    if (!j) return;
    setMsg(`Barca assegnata al posto ${postoScelto.codice}.`);
    setPostoScelto(null);
    setForm(formAssegnazione());
    carica();
    caricaElenchi();
    segnalaCambiamento("ormeggio");
  };

  const sposta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sel || !move.postoId) return;
    const body: any = { azione: "sposta", postoId: move.postoId };
    if (move.decorrenza) body.decorrenza = new Date(move.decorrenza).toISOString();
    const j = await chiama(`/api/v1/ormeggio/permanenze/${sel.id}`, "PATCH", body);
    if (j) { setMsg("Barca spostata."); setMove({ aperto: false, postoId: "", decorrenza: "" }); }
  };

  const r = griglia?.riepilogo;

  const corpoPannello = sel ? (
    <SchedaPosto permanenza={sel} posto={postoSelezionato} dettaglio={dettaglio?.id === sel.id ? dettaglio : null}
      errore={erroreDettaglio} onRiprova={() => setTentativoDettaglio((v) => v + 1)} tab={tab} onTab={setTab}
      vedeImporti={vedeImporti} onChiudi={chiudiSelezione}>
        {move.aperto ? (
          <form onSubmit={sposta} className="grid gap-2 rounded-2xl border border-line p-3">
            <p className="text-xs font-bold">Sposta barca</p>
            <select className="rounded-2xl border border-line p-2.5" value={move.postoId} onChange={(e) => setMove({ ...move, postoId: e.target.value })} required>
              <option value="">Nuovo posto…</option>
              {tuttiPosti.filter((p) => !p.bloccato && !p.permanenza).map((p) => (
                <option key={p.id} value={p.id}>{p.codice} · {p.areaNome}</option>
              ))}
            </select>
            <label className="grid gap-1 text-xs text-muted"><span>Decorrenza dello spostamento</span>
              <input type="datetime-local" className="rounded-2xl border border-line p-2.5" value={move.decorrenza} onChange={(e) => setMove({ ...move, decorrenza: e.target.value })} />
            </label>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" type="submit">Conferma spostamento</button>
              <button type="button" className="btn-soft" onClick={() => setMove({ aperto: false, postoId: "", decorrenza: "" })}>Annulla</button>
            </div>
          </form>
        ) : (
          <button className="btn-soft" onClick={() => setMove({ aperto: true, postoId: "", decorrenza: "" })}>⇄ Sposta barca</button>
        )}
    </SchedaPosto>
  ) : null;

  return (
    <div className="grid gap-2 sm:gap-3">
      {(err || erroreCaricamento) && <Avviso tono="errore">{err || erroreCaricamento}{erroreCaricamento && <button type="button" className="ml-3 font-bold underline" disabled={caricamento || busy} onClick={() => { setCaricamento(true); carica(); }}>Riprova</button>}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      <IntestazioneOrmeggio titolo="Quadro posti" indietro={false} azioni={<>
        {utente?.role === "owner" && <button type="button" className={configura ? "btn-primary" : "btn-soft"} aria-label={configura ? "Fine configurazione" : "Configura posti"} aria-pressed={configura} disabled={busy || caricamento} onClick={() => { if (!configura) { if (areaSelezionata) configuraArea(areaSelezionata); setSelId(null); setVista("griglia"); setRicerca(""); setStato("tutti"); } else carica(); setConfigura(!configura); }}><Icona nome="ingranaggio" className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">{configura ? "Fine configurazione" : "Configura posti"}</span></button>}
        <button className="btn-soft px-3 sm:hidden" aria-label="Legenda stati" aria-expanded={legenda} onClick={() => setLegenda(!legenda)}>?</button>
      </>} />
      <RiepilogoPosti dati={r} aperto={mostraDaSistemare} onDaSistemare={() => { setSelId(null); setMostraDaSistemare(true); }}
        selezione={categoriaPosti} onSelezione={(categoria) => setCategoriaPosti((attuale) => attuale === categoria ? null : categoria)} onAnteprima={setAnteprimaPosti} />
      {mostraDaSistemare && <Dialogo aperto onChiudi={chiudiDaSistemare} titolo="Da sistemare" larghezza="max-w-3xl">
        <div className="max-h-[70dvh] overflow-y-auto pr-1">
          <p className="mb-3 text-sm text-muted">Posti che richiedono attenzione in tutte le aree, per il {new Date(`${data}T12:00:00`).toLocaleDateString("it-IT")}. Apri la voce per occupartene.</p>
          {caricamento ? <p role="status" className="text-sm text-muted">Aggiorno le segnalazioni…</p> : !griglia ? <Avviso tono="errore">Dati non disponibili. Chiudi e aggiorna il quadro.</Avviso> : r?.daSistemare === 0 ? <div className="rounded-2xl bg-foam p-5 text-center text-deep"><Icona nome="check" className="mx-auto mb-2 h-7 w-7" /><p className="font-semibold">Tutto in ordine</p><p className="mt-1 text-sm">Nessun posto da sistemare nella data selezionata.</p></div> : <div className="grid gap-3">
            {aree.flatMap((a) => a.posti.filter((p) => p.permanenza?.colore === "giallo").map((p) => {
              const permanenza = p.permanenza!;
              return <article key={p.id} className="rounded-2xl border border-signature/60 bg-foam/40 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div><p className="font-semibold text-deep">{permanenza.boatNome} <span className="text-ocean">· {p.codice}</span></p><p className="text-xs text-muted">{a.nome} · {permanenza.proprietario ?? "Proprietario non indicato"}</p></div>
                  <button className="btn-soft text-xs" onClick={() => { setAreaId(a.id); setRicerca(""); setStato("tutti"); setTab("scheda"); setSelId(permanenza.id); setMostraDaSistemare(false); }}>Mostra nel quadro</button>
                </div>
                <div className="grid gap-2">
                  {permanenza.segnalazioni.map((problema) => {
                    const riservato = problema.tipo !== "attivita" && !vedeImporti;
                    const href = `/gestionale/ormeggio/permanenza/${permanenza.id}?tab=${problema.tipo === "attivita" ? "attivita" : problema.tipo === "conto" ? "conto" : "scheda&documenti=1"}`;
                    return <div key={problema.tipo} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm"><div className="min-w-0 flex-1"><span className="flex items-center gap-2"><Icona nome={problema.tipo === "attivita" ? "checklist" : problema.tipo === "conto" ? "portafoglio" : "documento"} className="h-4 w-4 shrink-0 text-ocean" />{problema.descrizione}</span>{problema.dettagli && <ul className="mt-1 list-inside list-disc text-xs leading-relaxed text-muted">{problema.dettagli.map((testo, i) => <li key={i}>{testo}</li>)}</ul>}</div>{riservato ? <span className="text-xs text-muted">Personale autorizzato</span> : <Link className="inline-flex items-center gap-1 font-bold text-ocean hover:underline" href={href}>{problema.tipo === "attivita" ? "Gestisci attività" : problema.tipo === "conto" ? "Apri conto" : "Gestisci contratto"}<Icona nome="freccia-destra" className="h-3.5 w-3.5" /></Link>}</div>;
                  })}
                </div>
              </article>;
            }))}
          </div>}
          <p className="mt-3 text-xs text-muted">Il conteggio riguarda i posti, non il numero di problemi. Le segnalazioni economiche rispettano i tuoi permessi.</p>
        </div>
      </Dialogo>}

      <div aria-label="Comandi del quadro posti" className="grid grid-cols-2 items-center gap-2 rounded-[20px] border border-ocean/15 bg-foam/40 p-2 shadow-[0_5px_16px_-10px_rgba(5,47,63,0.3)] sm:flex sm:flex-wrap">
        <div className="flex min-w-0 items-center gap-0 sm:gap-1">
          <button className="btn-ghost px-1 sm:px-2" aria-label="Giorno precedente" onClick={() => setData(aggiungiGiorni(data, -1))}>‹</button>
          <input aria-label="Data del quadro" type="date" className="min-w-0 flex-1 rounded-xl border border-ocean/15 bg-white px-1 py-2 text-xs text-deep sm:text-sm" value={data} onChange={(e) => e.target.value && setData(e.target.value)} />
          <button className="btn-ghost px-1 sm:px-2" aria-label="Giorno successivo" onClick={() => setData(aggiungiGiorni(data, 1))}>›</button>
          {data !== oggi() && <button className="btn-ghost px-2" onClick={() => setData(oggi())}>Oggi</button>}
        </div>
        {aree.length > 0 && <select aria-label="Area" className="min-w-0 max-w-full rounded-xl border border-ocean/15 bg-white p-2 text-sm text-deep" value={areaSelezionata?.id ?? ""} disabled={busy} onChange={(e) => { setAreaId(e.target.value); setSelId(null); const a = aree.find((a) => a.id === e.target.value); if (configura && a) configuraArea(a); }}>
          {aree.map((a) => <option key={a.id} value={a.id}>{a.nome} · {a.posti.filter((p) => !p.bloccato && !p.permanenza).length} liberi</option>)}
        </select>}
        <input aria-label="Cerca nei posti" className="col-span-2 min-w-0 flex-1 rounded-xl border border-ocean/15 bg-white p-2 text-sm text-deep" placeholder="Barca, proprietario, posto…" value={ricerca} onChange={(e) => setRicerca(e.target.value)} />
        <select aria-label="Stato del posto o della barca" className="min-w-0 rounded-xl border border-ocean/15 bg-white p-2 text-sm text-deep" value={stato} onChange={(e) => setStato(e.target.value)}>
          <option value="tutti">Tutti gli stati</option><option value="libero">Posti liberi</option><option value="in_sosta">Al posto</option><option value="da_fare">Attività da fare</option><option value="in_mare">In mare</option><option value="bloccata">Barche non disponibili</option><option value="non_usabile">Posti non utilizzabili</option>
        </select>
        {(ricerca || stato !== "tutti") && <button className="btn-ghost px-2" onClick={() => { setRicerca(""); setStato("tutti"); }}>Azzera filtri</button>}
        <div className="inline-flex justify-center rounded-full border border-ocean/15 bg-white p-0.5">
          {(["griglia", "elenco"] as const).map((v) => <button key={v} aria-pressed={vista === v} className={"rounded-full px-3 py-1.5 text-sm font-bold " + (vista === v ? "bg-signature text-deep shadow-sm" : "text-ocean hover:bg-foam")} onClick={() => setVista(v)}>{v === "griglia" ? "Griglia" : "Elenco"}</button>)}
        </div>
      </div>
      {caricamento && <p role="status" className="text-sm text-muted">Aggiorno i posti…</p>}
      {areaSelezionata && (q || stato !== "tutti") && <p role="status" className="text-xs text-muted">{areaSelezionata.posti.filter(corrisponde).length} posti corrispondono nell’area {areaSelezionata.nome}. Le coordinate della griglia restano fisse.</p>}

      {/* Legenda */}
      <div className={(legenda ? "flex " : "hidden ") + "flex-wrap items-center gap-3 text-xs sm:flex"}>
        <span className="inline-flex items-center gap-1" title="Stato automatico: barca presente al posto, senza attività aperte e senza uscita in mare."><i className="h-3 w-3 rounded-full bg-[#d8f3ea] ring-1 ring-[#a9e0d0]" /> Al posto</span>
        <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-[#fff0cc] ring-1 ring-[#f0d59a]" /> Da fare</span>
        <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-[#e1f5f2] ring-1 ring-[#8fddd5]" /> In mare: posto assegnato</span>
        {areaSelezionata?.posti.some((p) => p.permanenza?.statoGriglia === "bloccata") && <span className="inline-flex items-center gap-1" title="La barca è segnata in manutenzione o non disponibile. È distinto dal blocco di un posto."><i className="h-3 w-3 rounded-full bg-[#fdeeea] ring-1 ring-[#f6c9be]" /> Non disponibile</span>}
        <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-white ring-1 ring-line" /> libero</span>
        <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-[#e8eeed] ring-1 ring-line" /> non utilizzabile</span>
      </div>

      {configura && <div className="grid gap-2">
        {areaSelezionata && <form className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-12 lg:items-end" aria-label="Configura griglia selezionata" onSubmit={salvaArea}>
          <div className="sm:col-span-2 lg:col-span-12"><h2 className="text-lg">Configura {areaSelezionata.nome}</h2><p className="text-xs text-muted">Modifica questa area. Nella griglia, clicca un posto per bloccarlo o riabilitarlo; il cambio del singolo posto si salva subito.</p></div>
          <label className="grid gap-1 text-sm lg:col-span-5"><span>Nome area</span><input className="campo" required maxLength={80} value={areaForm.nome} onChange={(e) => setAreaForm({ ...areaForm, nome: e.target.value })} disabled={busy} /></label>
          <label className="grid gap-1 text-sm lg:col-span-2"><span>Righe (lettere)</span><input className="campo" type="number" min={1} max={40} required value={areaForm.righe} onChange={(e) => setAreaForm({ ...areaForm, righe: Number(e.target.value) })} disabled={busy} /></label>
          <label className="grid gap-1 text-sm lg:col-span-2"><span>Colonne (numeri)</span><input className="campo" type="number" min={1} max={40} required value={areaForm.colonne} onChange={(e) => setAreaForm({ ...areaForm, colonne: Number(e.target.value) })} disabled={busy} /></label>
          <button type="submit" className="btn-primary lg:col-span-3" disabled={busy || areaForm.id !== areaSelezionata.id}>Salva griglia</button>
        </form>}
        <details className="card p-3" open={aree.length === 0}><summary className="cursor-pointer text-sm font-semibold text-ocean">＋ Crea un’altra area</summary>
          <form className="grid gap-3 pt-3 md:grid-cols-12 md:items-end" onSubmit={creaArea}>
          <label className="grid gap-1 text-sm md:col-span-5"><span className="text-xs font-semibold text-muted">Nome area *</span>
            <input className="rounded-2xl border border-line p-3" placeholder="es. Area ormeggio / Piazzale" value={nuovaArea.nome} onChange={(e) => setNuovaArea({ ...nuovaArea, nome: e.target.value })} required />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2"><span className="text-xs font-semibold text-muted">Righe (lettere)</span>
            <input className="rounded-2xl border border-line p-3" type="number" min={1} max={40} value={nuovaArea.righe} onChange={(e) => setNuovaArea({ ...nuovaArea, righe: Number(e.target.value) })} />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2"><span className="text-xs font-semibold text-muted">Colonne</span>
            <input className="rounded-2xl border border-line p-3" type="number" min={1} max={40} value={nuovaArea.colonne} onChange={(e) => setNuovaArea({ ...nuovaArea, colonne: Number(e.target.value) })} />
          </label>
          <div className="md:col-span-3"><button className="btn-primary inline-flex w-full items-center justify-center gap-1.5" type="submit" disabled={busy}><Icona nome="piu" className="h-4 w-4" /> Crea area</button></div>
        </form>
        </details>
      </div>}

      {!!griglia?.fuoriGriglia?.length && <section className="card border-ocean/30 bg-foam/30 p-4" aria-label="Barche fuori griglia">
        <h2 className="text-lg">Barche fuori griglia ({griglia.fuoriGriglia.length})</h2>
        <p className="mb-3 text-sm text-muted">Queste barche erano assegnate a posti rimossi. Le soste e i conti restano disponibili: apri la scheda e usa «Sposta barca» per scegliere un nuovo posto.</p>
        <div className="grid gap-2 sm:grid-cols-2">{griglia.fuoriGriglia.map((p) => <Link key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-3 hover:border-ocean" href={`/gestionale/ormeggio/permanenza/${p.id}`}><span className="min-w-0"><span className="block truncate font-semibold">{p.boatNome} · {p.proprietario ?? "Proprietario non indicato"}</span><span className="block text-xs text-muted">{p.motivo} · {p.areaNome} · {p.postoCodice}</span></span><span className="shrink-0 text-sm font-bold text-ocean">Apri scheda →</span></Link>)}</div>
      </section>}

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 grid gap-4">
          {/* VISTA ELENCO */}
          {vista === "elenco" && areaSelezionata && (
            <section className="card overflow-x-auto p-4 md:p-5">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr><th className="p-2">Posto</th><th className="p-2">Barca</th><th className="p-2">Proprietario</th><th className="p-2">Stato</th><th className="p-2">Attività</th><th className="p-2">Azioni</th></tr>
                </thead>
                <tbody>
                  {areaSelezionata.posti.filter(corrisponde).map((p) => (
                    <tr key={p.id} data-posto-elenco={p.id} data-evidenza-posto={evidenza(p)} className="border-t border-line transition-[background-color,box-shadow] motion-reduce:transition-none">
                      <td className="p-2 font-semibold">{p.codice}</td>
                      <td className="p-2">{p.permanenza?.boatNome ?? <span className="text-muted">libero</span>}</td>
                      <td className="p-2 text-muted">{p.permanenza?.proprietario ?? "—"}</td>
                      <td className="p-2">
                        {p.bloccato ? <span className="text-muted">non utilizzabile</span> : p.permanenza ? (
                          <button onClick={() => setSelId(p.permanenza!.id)} className={"rounded-full border px-2 py-0.5 text-[11px] font-semibold " + STILE[p.permanenza.statoGriglia]}>{NOME_STATO[p.permanenza.statoGriglia]}</button>
                        ) : <span className="text-muted">libero</span>}
                      </td>
                      <td className="p-2 text-muted">{p.permanenza ? `${p.permanenza.attivitaDaFare} da fare` : "—"}</td>
                      <td className="p-2">{configura ? <button className="btn-soft" disabled={busy} onClick={() => toggleBlocco(p)}>{p.bloccato ? "Riabilita" : "Blocca"}</button> : p.permanenza ? <Link className="btn-ghost" href={`/gestionale/ormeggio/permanenza/${p.permanenza.id}`}>Scheda →</Link> : !p.bloccato ? <button className="btn-soft" onClick={() => { setForm({ ...formAssegnazione(), inizioAt: data }); setPostoScelto(p); }}>Assegna</button> : null}</td>
                    </tr>
                  ))}
                  {areaSelezionata.posti.filter(corrisponde).length === 0 && <tr><td colSpan={6} className="text-muted">Nessun posto corrisponde ai filtri.</td></tr>}
                </tbody>
              </table>
            </section>
          )}

          {vista === "griglia" && areaSelezionata && <section className="card min-w-0 p-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 sm:mb-3">
              <h2 className="text-xl">{areaSelezionata.nome}</h2>
              <span className="text-xs text-muted">{areaSelezionata.colonne} colonne × {areaSelezionata.righe} righe</span>
              {configura && <button className="text-sm font-bold text-danger" onClick={() => eliminaArea(areaSelezionata)}>Elimina area</button>}
            </div>
            <GrigliaPosti area={areaSelezionata} configura={configura} busy={busy || caricamento} trascinabile={data === oggi()} corrisponde={corrisponde} evidenza={evidenza}
              onTrascinamento={setTrascinamento} onErrore={setErr}
              onSeleziona={(p) => { setSelId(p.id); setTab("scheda"); setMove({ aperto: false, postoId: "", decorrenza: "" }); }}
              onAssegna={(posto) => { setForm({ ...formAssegnazione(), inizioAt: data }); setPostoScelto(posto); setErr(""); setMsg(""); }}
              onToggleBlocco={toggleBlocco}
              onSposta={async (permanenza, posto) => {
                const j = await chiama(`/api/v1/ormeggio/permanenze/${permanenza.id}`, "PATCH", { azione: "sposta", postoId: posto.id, revisione: permanenza.revisione });
                if (!j) return false;
                setMsg(`${permanenza.boatNome} spostata al posto ${posto.codice}.`);
                setMove({ aperto: false, postoId: "", decorrenza: "" });
                return true;
              }} />
          </section>}

          {griglia && griglia.aree.length === 0 && (
            <div className="card grid place-items-center gap-2 p-8 text-center">
              <p className="font-semibold">Nessuna area configurata.</p>
              <p className="text-sm text-muted">Apri «Configura posti» e crea la prima area indicando righe e colonne.</p>
            </div>
          )}
        </div>

        {/* SCHEDA LATERALE (desktop/tablet) */}
        {sel && pannelloLaterale && (
          <aside ref={pannelloRef} aria-label="Dettagli del posto" className="sticky top-3 hidden max-h-[calc(100dvh-32px)] w-[340px] shrink-0 overflow-y-auto rounded-3xl border border-line bg-white p-3 shadow-lg xl:block">
            {corpoPannello}
          </aside>
        )}
      </div>

      {/* SCHEDA A TUTTO SCHERMO (telefono) */}
      {sel && !pannelloLaterale && <Dialogo aperto onChiudi={chiudiSelezione} titolo="Scheda del posto" larghezza="max-w-lg max-h-[90dvh] overflow-y-auto">{corpoPannello}</Dialogo>}

      {postoScelto && (
        <Dialogo aperto onChiudi={() => { if (!busy) setPostoScelto(null); }} titolo={`Assegna il posto ${postoScelto.codice}`} larghezza="min-w-0 max-w-2xl">
          <form className="grid min-w-0 max-h-[75dvh] gap-3 overflow-y-auto text-sm" onClick={(e) => e.stopPropagation()} onSubmit={assegna}>
            {(err || erroreCaricamento) && <Avviso tono="errore">{err || erroreCaricamento}{erroreCaricamento && <button type="button" className="ml-3 font-bold underline" disabled={caricamento || busy} onClick={() => { setCaricamento(true); carica(); }}>Riprova</button>}</Avviso>}
            <fieldset className="grid min-w-0 gap-2 rounded-2xl border border-line p-3">
              <legend className="px-1 text-xs font-bold text-muted">Proprietario</legend>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2"><input type="radio" checked={form.propMode === "esistente"} onChange={() => setForm({ ...form, propMode: "esistente" })} /> Già in anagrafica</label>
                <label className="flex items-center gap-2"><input type="radio" checked={form.propMode === "nuovo"} onChange={() => setForm({ ...form, propMode: "nuovo" })} /> Nuovo</label>
              </div>
              {form.propMode === "esistente" ? (
                <select className="min-w-0 w-full rounded-2xl border border-line p-3" value={form.proprietarioId} onChange={(e) => setForm({ ...form, proprietarioId: e.target.value })} required>
                  <option value="">Scegli il proprietario…</option>
                  {proprietari.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.telefono ? ` · ${p.telefono}` : ""}</option>)}
                </select>
              ) : (
                <div className="grid min-w-0 gap-2 md:grid-cols-2">
                  <input className="min-w-0 w-full rounded-2xl border border-line p-3" placeholder="Nome o denominazione *" value={form.propNome} onChange={(e) => setForm({ ...form, propNome: e.target.value })} required />
                  <input className="min-w-0 w-full rounded-2xl border border-line p-3" placeholder="Telefono" value={form.propTelefono} onChange={(e) => setForm({ ...form, propTelefono: e.target.value })} />
                </div>
              )}
            </fieldset>
            <fieldset className="grid min-w-0 gap-2 rounded-2xl border border-line p-3">
              <legend className="px-1 text-xs font-bold text-muted">Barca</legend>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2"><input type="radio" checked={form.barcaMode === "esistente"} onChange={() => setForm({ ...form, barcaMode: "esistente" })} /> Già in elenco</label>
                <label className="flex items-center gap-2"><input type="radio" checked={form.barcaMode === "nuovo"} onChange={() => setForm({ ...form, barcaMode: "nuovo" })} /> Nuova</label>
              </div>
              {form.barcaMode === "esistente" ? (
                <select className="min-w-0 w-full rounded-2xl border border-line p-3" value={form.boatId} onChange={(e) => setForm({ ...form, boatId: e.target.value })} required>
                  <option value="">Scegli la barca…</option>
                  {barche.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </select>
              ) : (
                <div className="grid min-w-0 gap-2">
                  <input className="min-w-0 w-full rounded-2xl border border-line p-3" placeholder="Nome barca *" value={form.barcaNome} onChange={(e) => setForm({ ...form, barcaNome: e.target.value })} required />
                  <div className="grid min-w-0 gap-2 md:grid-cols-2">
                    <label className="grid min-w-0 gap-1">
                      <span className="text-xs font-semibold text-muted">Tipo di barca</span>
                      <Combo
                        testo={form.barcaTipo}
                        onTesto={(v) => setForm((f) => ({ ...f, barcaTipo: v, barcaTipoCodice: codiceDaTesto(v) ?? "" }))}
                        onSeleziona={(o) => setForm((f) => ({ ...f, barcaTipo: o.etichetta, barcaTipoCodice: o.valore }))}
                        opzioni={OPZIONI_TIPI}
                        placeholder="Es. gozzo, open, gommone…"
                        className="min-w-0 w-full rounded-2xl border border-line p-3"
                      />
                    </label>

                  </div>
                  <p className="text-xs text-muted">Tipologia facoltativa: scrivi liberamente o scegli dai suggerimenti. Il tipo determina la sagoma della barca nella griglia.</p>
                </div>
              )}
            </fieldset>
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              <label className="grid min-w-0 gap-1"><span className="text-xs font-semibold text-muted">Inizio</span>
                <input id="inizio-sosta" type="date" className="min-w-0 w-full rounded-2xl border border-line p-3" value={form.inizioAt} onChange={(e) => setForm({ ...form, inizioAt: e.target.value })} required />
              </label>
              <label className="grid min-w-0 gap-1"><span className="text-xs font-semibold text-muted">Fine prevista (ultimo giorno incluso)</span>
                <input id="fine-sosta" type="date" className="min-w-0 w-full rounded-2xl border border-line p-3" min={form.inizioAt || undefined} value={form.finePrevistaAt} onChange={(e) => setForm({ ...form, finePrevistaAt: e.target.value })} />
              </label>
              {vedeImporti && <div className="grid min-w-0 gap-2 md:col-span-2">
                <label className="grid min-w-0 gap-1"><span className="text-xs font-semibold text-muted">Corrispettivo concordato (€)</span>
                  <input id="corrispettivo-sosta" inputMode="decimal" aria-describedby="suggerimento-prezzo-sosta" className="min-w-0 w-full rounded-2xl border border-line p-3" placeholder="Seleziona le date o inserisci il prezzo" value={corrispettivoEuro} onChange={(e) => setForm({ ...form, corrispettivoEuro: e.target.value })} />
                </label>
                <div id="suggerimento-prezzo-sosta" aria-live="polite" className="rounded-2xl bg-foam p-3 text-xs text-muted">
                  {catalogo.caricamento ? "Carico le tariffe…" : catalogo.errore ? <span>Tariffe non disponibili. Inserisci un prezzo oppure <button type="button" className="font-bold text-ocean underline" onClick={() => catalogo.prepara()}>ricarica il catalogo</button>.</span> : preventivo.importoCent !== null ? <>
                    <span className="block font-semibold text-deep">{form.corrispettivoEuro === null ? "Prezzo suggerito" : "Prezzo personalizzato · suggerimento"}: {euro(preventivo.importoCent)}</span>
                    <span>{preventivo.mesi > 0 ? `${preventivo.mesi} ${preventivo.mesi === 1 ? "mese" : "mesi"} × ${euro(tariffaMensileCent ?? 0)}` : ""}{preventivo.mesi > 0 && preventivo.giorni > 0 ? " + " : ""}{preventivo.giorni > 0 ? `${preventivo.giorni} ${preventivo.giorni === 1 ? "giorno" : "giorni"} × ${euro(tariffaGiornalieraCent ?? 0)}` : ""}. Giorno iniziale e finale inclusi; mesi di calendario.</span>
                    {form.corrispettivoEuro !== null && <button type="button" className="mt-2 block font-bold text-ocean underline" onClick={() => setForm((f) => ({ ...f, corrispettivoEuro: null }))}>Usa prezzo suggerito</button>}
                  </> : preventivo.messaggio}
                </div>
              </div>}
            </div>
            <p className="text-xs text-muted">{form.inizioAt === oggi() ? "Con inizio oggi, la sosta parte dal momento del salvataggio: i posti liberati oggi sono subito riutilizzabili. " : ""}Senza una fine prevista, il posto resta assegnato a tempo indeterminato e deve essere libero anche nei giorni successivi.</p>
            <input className="min-w-0 w-full rounded-2xl border border-line p-3" placeholder="Note (facoltative)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-primary inline-flex items-center justify-center gap-1.5" type="submit" disabled={busy || (vedeImporti && form.corrispettivoEuro === null && !!form.finePrevistaAt && (catalogo.caricamento || !!catalogo.errore || preventivo.importoCent === null))}><Icona nome="piu" className="h-4 w-4" /> {busy ? "Salvo…" : "Registra la sosta"}</button>
              {vedeImporti && corrispettivoEuro.trim() && /^\d+(?:[.,]\d{1,2})?$/.test(corrispettivoEuro.trim()) && <span className="text-muted">Addebito custodia: <b>{euro(Math.round(Number(corrispettivoEuro.replace(",", ".")) * 100))}</b></span>}
            </div>
          </form>
        </Dialogo>
      )}
      {conferma.dialogo}
    </div>
  );
}

export default function OrmeggioPage() {
  const u = useUtente();
  if (!u) return <p className="text-sm text-muted">Caricamento…</p>;
  if (u.role !== "owner" && u.role !== "superadmin" && u.ruoloOrmeggio === "visualizzazione") return <Avviso tono="attenzione">Questo profilo non è più disponibile. Chiedi al titolare di assegnarti il ruolo Responsabile o Addetto.</Avviso>;
  return u.role !== "owner" && u.ruoloOrmeggio === "addetto" ? <OperazioniAddetto /> : <QuadroOperativo />;
}
