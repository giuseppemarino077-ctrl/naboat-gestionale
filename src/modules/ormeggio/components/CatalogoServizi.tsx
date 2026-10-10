"use client";
import { useRef, useState } from "react";
import { Avviso } from "@/components/ui/Avviso";
import { Dialogo, useConferma } from "@/components/ui/Dialogo";
import { segnalaCambiamento } from "@/lib/aggiorna";
import type { ServizioOrmeggio, useCatalogoServizi } from "@/modules/ormeggio/use-catalogo-servizi";

const vuoto = () => ({ nome: "", prezzoEuro: "", unita: "" });
type FormServizio = ReturnType<typeof vuoto>;
const euro = (cent: number) => (cent / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

function CampiServizio({ form, onChange, vedeImporti }: { form: FormServizio; onChange: (form: FormServizio) => void; vedeImporti: boolean }) {
  return <>
    <label className="grid min-w-0 gap-1 text-sm"><span className="text-xs font-semibold text-muted">Nome *</span><input className="campo" required maxLength={80} placeholder="es. Lavaggio" value={form.nome} onChange={(e) => onChange({ ...form, nome: e.target.value })} /></label>
    {vedeImporti && <label className="grid min-w-0 gap-1 text-sm"><span className="text-xs font-semibold text-muted">Prezzo € / unità</span><input className="campo" inputMode="decimal" placeholder="Da definire" value={form.prezzoEuro} onChange={(e) => onChange({ ...form, prezzoEuro: e.target.value })} /></label>}
    <label className="grid min-w-0 gap-1 text-sm"><span className="text-xs font-semibold text-muted">Unità</span><input className="campo" maxLength={20} placeholder="litri / ore / fisso" value={form.unita} onChange={(e) => onChange({ ...form, unita: e.target.value })} /></label>
  </>;
}

export function CatalogoServizi({ catalogo, tendina = false }: { catalogo: ReturnType<typeof useCatalogoServizi>; tendina?: boolean }) {
  const { servizi, caricamento, errore, carica, prepara, vedeImporti, puoModificare } = catalogo;
  const [selezionatoId, setSelezionatoId] = useState("");
  const [ricerca, setRicerca] = useState("");
  const [elencoAperto, setElencoAperto] = useState(false);
  const campoRicerca = useRef<HTMLInputElement>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [nuovo, setNuovo] = useState(vuoto);
  const [modifica, setModifica] = useState(vuoto);
  const [dialogo, setDialogo] = useState<{ id: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [erroreDialogo, setErroreDialogo] = useState("");
  const [msg, setMsg] = useState("");
  const conferma = useConferma();
  const selezionato = servizi.find((s) => s.id === selezionatoId);
  const normalizza = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const visibili = servizi.filter((s) => tendina ? normalizza(s.nome).startsWith(normalizza(ricerca)) : normalizza(`${s.nome} ${s.unita ?? ""}`).includes(normalizza(ricerca)));
  const scegli = (servizio: ServizioOrmeggio) => { setSelezionatoId(servizio.id); setRicerca(servizio.nome); setMsg(""); setErr(""); campoRicerca.current?.focus(); setElencoAperto(false); };

  const apri = (servizio?: ServizioOrmeggio) => {
    setElencoAperto(false);
    setModifica(servizio ? { nome: servizio.nome, prezzoEuro: servizio.prezzoCent == null ? "" : String(servizio.prezzoCent / 100), unita: servizio.unita ?? "" } : vuoto());
    setErroreDialogo(""); setDialogo({ id: servizio?.id ?? null });
  };

  const salva = async (form: FormServizio, id: string | null, nelDialogo: boolean) => {
    if (busy || !puoModificare) return;
    const segnalaErrore = nelDialogo ? setErroreDialogo : setErr;
    segnalaErrore(""); setMsg("");
    const prezzo = form.prezzoEuro.trim();
    if (vedeImporti && prezzo && !/^\d+(?:[.,]\d{1,2})?$/.test(prezzo)) { segnalaErrore("Inserisci un prezzo valido con al massimo due decimali, maggiore o uguale a zero."); return; }
    const prezzoCent = prezzo ? Math.round(Number(prezzo.replace(",", ".")) * 100) : null;
    if (vedeImporti && prezzoCent !== null && (!Number.isSafeInteger(prezzoCent) || prezzoCent > 100000000)) { segnalaErrore("Il prezzo supera il limite consentito."); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/ormeggio/servizi${id ? `/${id}` : ""}`, {
        method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: form.nome.trim(), unita: form.unita.trim() || null, ...(vedeImporti ? { prezzoCent } : {}) }),
      });
      const j = await r.json();
      if (!r.ok) { segnalaErrore(j.error ?? "Non riesco a salvare il servizio."); return; }
      setSelezionatoId(j.id); setDialogo(null); setRicerca(tendina ? j.nome : ""); setElencoAperto(false); if (!id) setNuovo(vuoto());
      setMsg(id ? "Servizio aggiornato. Le attività già registrate conservano i propri dati." : "Servizio aggiunto. È disponibile anche nelle schede delle barche.");
      await carica(); segnalaCambiamento("ormeggio");
    } catch { segnalaErrore("Connessione interrotta: controlla il catalogo prima di riprovare."); }
    finally { setBusy(false); }
  };

  const elimina = async (servizio: ServizioOrmeggio) => {
    if (busy || !puoModificare) return;
    setElencoAperto(false);
    const ok = await conferma.chiedi({ titolo: `Eliminare "${servizio.nome}"?`, messaggio: "Il servizio verrà rimosso dal catalogo. Attività e addebiti già registrati conservano i propri dati.", confermaLabel: "Elimina servizio", pericoloso: true });
    if (!ok) { if (tendina) { setElencoAperto(true); requestAnimationFrame(() => campoRicerca.current?.focus()); } return; }
    if (busy || !puoModificare) return;
    setBusy(true); setEliminandoId(servizio.id); setErr(""); setMsg("");
    try {
      const r = await fetch(`/api/v1/ormeggio/servizi/${servizio.id}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok && r.status !== 404) { setErr(j.error ?? "Non riesco a eliminare il servizio."); return; }
      if (selezionatoId === servizio.id) setSelezionatoId("");
      await carica(); setElencoAperto(tendina); setMsg(r.status === 404 ? "Servizio già rimosso dal catalogo." : `Servizio «${servizio.nome}» eliminato dal catalogo.`); segnalaCambiamento("ormeggio");
    } catch { setErr("Connessione interrotta: controlla il catalogo prima di riprovare."); }
    finally { setBusy(false); setEliminandoId(null); }
  };

  const descrizione = (s: ServizioOrmeggio) => `${s.nome}${s.unita ? ` · ${s.unita}` : ""}${vedeImporti ? ` · ${s.prezzoCent == null ? "Prezzo da definire" : euro(s.prezzoCent)}` : ""}`;
  const elenco = <ul id="elenco-servizi" aria-label="Suggerimenti servizi" className={`grid gap-1 ${tendina ? "absolute left-0 right-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-2xl border border-line bg-white p-2 shadow-xl" : ""}`}>
    {visibili.map((s) => <li key={s.id} data-servizio-id={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm transition-colors hover:bg-foam/40">
      {tendina ? <button type="button" data-scegli-servizio className="min-w-0 flex-[1_1_140px] break-words py-1 text-left font-semibold text-deep hover:text-ocean" disabled={busy} onClick={() => scegli(s)}>{descrizione(s)}</button> : <span className="min-w-0 flex-1 break-words"><b>{s.nome}</b>{s.unita ? ` · ${s.unita}` : ""}{vedeImporti && s.prezzoCent != null ? ` · ${euro(s.prezzoCent)}` : ""}</span>}
      {puoModificare && <div className="flex gap-3"><button aria-label={`Modifica ${s.nome}`} className="min-h-9 text-sm font-bold text-ocean" disabled={busy} onClick={() => apri(s)}>Modifica</button><button aria-label={`Elimina ${s.nome}`} className="min-h-9 text-sm font-bold text-danger" disabled={busy} onClick={() => elimina(s)}>{eliminandoId === s.id ? "Elimino…" : "Elimina"}</button></div>}
    </li>)}
    {!visibili.length && <li className="px-3 py-2 text-sm text-muted">{caricamento ? "Carico il catalogo…" : "Nessun servizio con queste iniziali. Puoi aggiungere una nuova voce."}</li>}
  </ul>;

  return <section aria-label="Catalogo servizi" className="card grid min-w-0 gap-3 p-4">
    <div><h2 className="text-lg">{tendina ? "Servizi e attività offerte" : "Catalogo servizi"}</h2><p className="text-sm text-muted">{tendina ? "Cerca, modifica o elimina i servizi. Il catalogo è condiviso con le schede barca e Configurazione." : "Servizi pronti per l’ormeggio, tutti modificabili. Le modifiche valgono per le nuove attività; nessun addebito viene creato dal catalogo."}</p></div>
    {(errore || err) && <Avviso tono="errore" azione={errore ? <button className="btn-soft" onClick={() => prepara()}>Riprova</button> : undefined}>{errore || err}</Avviso>}
    {msg && <Avviso tono="ok">{msg}</Avviso>}
    {tendina ? <>
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        <div className="relative min-w-0 flex-[1_1_280px]" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setElencoAperto(false); }} onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); campoRicerca.current?.focus(); setElencoAperto(false); } }}>
          <input ref={campoRicerca} type="search" aria-label="Cerca servizio" aria-controls={elencoAperto ? "elenco-servizi" : undefined} aria-describedby="risultati-servizi" autoComplete="off" className="campo min-w-0" placeholder="Scrivi le prime lettere di un servizio…" value={ricerca} disabled={busy} onFocus={() => setElencoAperto(true)} onClick={() => setElencoAperto(true)} onChange={(e) => { setRicerca(e.target.value); setSelezionatoId(""); setElencoAperto(true); setMsg(""); setErr(""); }} onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setElencoAperto(true); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('#elenco-servizi [data-scegli-servizio]')?.focus()); }
            if (e.key === "Enter" && elencoAperto && visibili[0]) { e.preventDefault(); scegli(visibili[0]); }
          }} />
          {elencoAperto && elenco}
        </div>
        {ricerca && <button className="btn-ghost" disabled={busy} onClick={() => { setRicerca(""); setSelezionatoId(""); setElencoAperto(true); campoRicerca.current?.focus(); }}>Azzera ricerca</button>}
        {puoModificare && <><button className="btn-soft" disabled={!selezionato || busy || caricamento} onClick={() => selezionato && apri(selezionato)}>Modifica servizio</button><button className="btn-soft !text-danger" disabled={!selezionato || busy || caricamento} onClick={() => selezionato && elimina(selezionato)}>{eliminandoId ? "Elimino…" : "Elimina servizio"}</button><button className="btn-primary" disabled={busy || caricamento} onClick={() => apri()}>＋ Nuovo servizio</button></>}
      </div>
      <p id="risultati-servizi" className="text-xs text-muted" aria-live="polite">{caricamento ? "Carico il catalogo…" : ricerca ? `${visibili.length} servizi con queste iniziali · ${servizi.length} nel catalogo` : `${servizi.length} servizi nel catalogo · scrivi o clicca nel campo per scegliere`}</p>
      {selezionato && <p className="break-words text-sm text-muted">{descrizione(selezionato)}</p>}
    </> : <>
      {puoModificare && <form className="grid gap-2 md:grid-cols-4 md:items-end" onSubmit={(e) => { e.preventDefault(); salva(nuovo, null, false); }}>
        <CampiServizio form={nuovo} onChange={setNuovo} vedeImporti={vedeImporti} />
        <button className="btn-primary" disabled={busy || caricamento}>＋ Aggiungi</button>
      </form>}
      <input className="campo" aria-label="Cerca servizio" placeholder="Cerca nel catalogo…" value={ricerca} onChange={(e) => setRicerca(e.target.value)} />
    </>}
    {!tendina && elenco}
    {!visibili.length && <p className="text-sm text-muted" role="status">{caricamento ? "Carico il catalogo…" : ricerca ? "Nessun servizio corrisponde alla ricerca. Azzera la ricerca o aggiungi una nuova voce." : "Nessun servizio nel catalogo. Aggiungi la prima voce."}</p>}
    <p className="text-xs text-muted">Prezzi e nomi aggiornati si propongono nelle nuove attività. I lavori e gli addebiti già registrati mantengono i valori originali.</p>
    <Dialogo aperto={!!dialogo} onChiudi={() => { if (!busy) setDialogo(null); }} titolo={dialogo?.id ? "Modifica servizio" : "Nuovo servizio"}>
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (dialogo) salva(modifica, dialogo.id, true); }}>
        {erroreDialogo && <Avviso tono="errore">{erroreDialogo}</Avviso>}
        <CampiServizio form={modifica} onChange={setModifica} vedeImporti={vedeImporti} />
        <button className="btn-primary" disabled={busy}>{busy ? "Salvo…" : "Salva servizio"}</button>
      </form>
    </Dialogo>
    {conferma.dialogo}
  </section>;
}
