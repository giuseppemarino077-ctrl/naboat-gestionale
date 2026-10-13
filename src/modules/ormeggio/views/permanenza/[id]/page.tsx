"use client";
import { richiestaOrmeggio } from "@/modules/ormeggio/richiesta";

import { useCallback, useEffect, useRef, useState } from "react";
import { OperazioniAddetto } from "@/modules/ormeggio/components/OperazioniAddetto";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useUtente } from "@/components/Utente";
import { SceltaPriorita, StellePriorita } from "@/modules/ormeggio/components/PrioritaAttivita";
import { IntestazioneOrmeggio } from "@/modules/ormeggio/components/IntestazioneOrmeggio";
import { useAggiornamenti, segnalaCambiamento } from "@/lib/aggiorna";
import { Avviso } from "@/components/ui/Avviso";
import { Combo } from "@/components/ui/Combo";
import { useConferma } from "@/components/ui/Dialogo";
import { useModulo } from "@/components/ui/ModuloDialogo";
import { OPZIONI_TIPI } from "@/modules/piattaforma/tipi-barche";
import { codiceDaTesto } from "@/modules/piattaforma/barche";
import { useCatalogoServizi } from "@/modules/ormeggio/use-catalogo-servizi";
import { CorrispettivoSosta } from "@/modules/ormeggio/components/CorrispettivoSosta";
import { telefonoWhatsApp } from "@/lib/telefono";
import { oggi } from "@/modules/piattaforma/date";

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const dataIt = (d?: string | null) => (d ? new Date(d).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—");

function SchedaCompleta() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [dati, setDati] = useState<any>(null);
  const { servizi, errore: erroreCatalogo, prepara: preparaCatalogo } = useCatalogoServizi();
  const [addetti, setAddetti] = useState<any[]>([]);
  const [posti, setPosti] = useState<any[]>([]);
  const [tab, setTab] = useState<"scheda" | "attivita" | "conto">("scheda");
  const [nuovaAttivitaAperta, setNuovaAttivitaAperta] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [nuovaAtt, setNuovaAtt] = useState({ tipo: "", priorita: 2, note: "", dataPrevista: "", quantita: "", unita: "", prezzoEuro: "", incluso: false, addettoId: "" });
  const [nuovoIncasso, setNuovoIncasso] = useState({ importoEuro: "", metodo: "contanti", descrizione: "" });
  const [nuovoAddebito, setNuovoAddebito] = useState({ descrizione: "", importoEuro: "", origine: "altro" });
  const utente = useUtente();
  const vedeImporti = utente?.vedeImporti === true;
  const [documentiAperti, setDocumentiAperti] = useState(false);
  const [busy, setBusy] = useState(false);
  const salvataggio = useRef(false);
  const richiesta = useRef(0);
  const [bnome, setBnome] = useState("");
  const [btipo, setBtipo] = useState("");
  const barcaIniz = useRef<string | null>(null);
  const attivitaRaggiunta = useRef<string | null>(null);
  const [attivitaEvidenziata, setAttivitaEvidenziata] = useState<string | null>(null);
  const conferma = useConferma();
  const modulo = useModulo();

  const carica = useCallback(async () => {
    const seq = ++richiesta.current;
    try {
      const r = await richiestaOrmeggio(`/api/v1/ormeggio/permanenze/${id}`);
      const j = await r.json();
      if (seq !== richiesta.current) return;
      if (r.ok && j?.id) setDati(j); else setErr(j?.error ?? "Permanenza non trovata.");
    } catch { if (seq === richiesta.current) setErr("Connessione interrotta. Riprova."); }
  }, [id]);
  useEffect(() => {
    setDati(null); setErr(""); setMsg("");
    const ricerca = new URLSearchParams(window.location.search);
    const richiesto = ricerca.get("tab");
    setDocumentiAperti(ricerca.get("documenti") === "1");
    setTab(richiesto === "attivita" || richiesto === "conto" ? richiesto : "scheda");
    setNuovaAttivitaAperta(richiesto === "attivita" && ricerca.get("nuova") === "1");
    carica();
  }, [carica]);
  useEffect(() => {
    if (!dati || tab !== "attivita") return;
    const bersaglio = window.location.hash.slice(1);
    if (attivitaRaggiunta.current === bersaglio || !dati.attivita.some((a: { id: string }) => bersaglio === `attivita-${a.id}`)) return;
    setAttivitaEvidenziata(bersaglio);
    const frame = requestAnimationFrame(() => {
      const riga = document.getElementById(bersaglio);
      if (!riga) return;
      attivitaRaggiunta.current = bersaglio;
      riga.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [dati, tab]);
  useAggiornamenti(() => { if (!busy && !document.activeElement?.matches("input, select, textarea")) return carica(); }, ["ormeggio"]);
  useEffect(() => { if (utente && !vedeImporti && tab === "conto") setTab("scheda"); }, [utente, vedeImporti, tab]);
  useEffect(() => {
    richiestaOrmeggio("/api/v1/ormeggio/aree").then((r) => r.json()).then((j) => Array.isArray(j) && setPosti(j.flatMap((a: any) => a.posti.map((p: any) => ({ ...p, areaNome: a.nome }))))).catch(() => {});

  }, []);

  useEffect(() => {
    if (utente?.role === "owner" || utente?.ruoloOrmeggio === "responsabile") richiestaOrmeggio("/api/v1/collaboratori").then((r) => r.json()).then((j) => Array.isArray(j.membri) && setAddetti(j.membri.filter((m: any) => m.stato === "attiva" && m.ruoloOrmeggio !== "visualizzazione").map((m: any) => ({ id: m.userId, nome: m.user.nome })))).catch(() => {});
  }, [utente?.role]);

  const api = async (url: string, method: string, body?: any) => {
    if (salvataggio.current) return null;
    salvataggio.current = true;
    setBusy(true); setErr(""); setMsg("");
    try {
    const r = await richiestaOrmeggio(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); if (r.status === 409) await carica(); return null; }
    await carica();
    segnalaCambiamento("ormeggio");
    return j;
    } catch { setErr("Connessione interrotta: aggiorna la scheda prima di riprovare."); return null; }
    finally { salvataggio.current = false; setBusy(false); }
  };

  const salvaBarca = (patch: Record<string, unknown>) => (dati?.id === id && dati?.boat?.id ? api(`/api/v1/ormeggio/barche/${dati.boat.id}`, "PATCH", patch) : null);

  useEffect(() => {
    if (dati?.id === id && barcaIniz.current !== id) {
      setBnome(dati.boat?.nome ?? "");
      setBtipo(dati.boat?.tipo ?? "");
      barcaIniz.current = id;
    }
  }, [dati, id]);

  const movimento = (tipo: "uscita" | "rientro") => api("/api/v1/ormeggio/movimenti", "POST", { permanenzaId: id, tipo });
  const sposta = async () => {
    const v = await modulo.apri("Sposta la barca", [
      {
        nome: "postoId",
        etichetta: "Nuovo posto",
        valore: "",
        opzioni: [{ valore: "", label: "Scegli il nuovo posto…" }, ...posti.filter((p: any) => !p.bloccato && p.id !== dati?.postoId).map((p: any) => ({ valore: p.id, label: `${p.codice} · ${p.areaNome}` }))],
      },
    ], { confermaLabel: "Sposta", descrizione: "Il trasferimento chiude la posizione precedente e apre quella nuova." });
    if (!v) return;
    if (!v.postoId) { setErr("Scegli un posto"); return; }
    await api(`/api/v1/ormeggio/permanenze/${id}`, "PATCH", { azione: "sposta", postoId: v.postoId });
  };
  const chiudi = async () => {
    const ok = await conferma.chiedi({
      titolo: "Chiudere la sosta?",
      messaggio: "La permanenza si chiude definitivamente e il posto viene liberato.",
      dettaglio: "Il conto e lo storico restano consultabili.",
      confermaLabel: "Chiudi sosta",
      pericoloso: true,
    });
    if (ok) await api(`/api/v1/ormeggio/permanenze/${id}`, "PATCH", { azione: "chiudi" });
  };

  const generaContratto = async () => {
    const j = await api(`/api/v1/ormeggio/permanenze/${id}/contratto`, "POST");
    if (j?.link) window.open(j.link, "_blank");
  };
  const apriWhatsapp = async () => {
    const telefono = dati?.boat?.proprietario?.telefono;
    const tel = telefonoWhatsApp(telefono);
    if (!tel) { setErr(telefono ? "Il numero del proprietario non è valido. Verificalo in anagrafica prima di aprire WhatsApp." : "Il proprietario non ha un telefono in anagrafica"); return; }
    const v = await modulo.apri("Messaggio WhatsApp", [
      { nome: "testo", etichetta: "Messaggio", tipo: "textarea", valore: `Gentile ${dati.boat.proprietario.nome}, la sua barca ${dati.boat.nome} ${dati.pronta ? "è pronta" : "è in custodia"}. Posto ${dati.posto?.codice ?? "da assegnare"}.` },
    ], { confermaLabel: "Apri WhatsApp" });
    if (!v) return;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(v.testo)}`, "_blank");
  };

  const aggiungiAttivita = async (e: React.FormEvent) => {
    e.preventDefault();
    const prezzoCent = nuovaAtt.prezzoEuro ? Math.round(Number(nuovaAtt.prezzoEuro.replace(",", ".")) * 100) : null;
    const j = await api("/api/v1/ormeggio/attivita", "POST", {
      permanenzaId: id,
      tipo: nuovaAtt.tipo,
      priorita: nuovaAtt.priorita,
      note: nuovaAtt.note.trim() || null,
      dataPrevista: nuovaAtt.dataPrevista || null,
      quantita: nuovaAtt.quantita ? Number(nuovaAtt.quantita) : null,
      unita: nuovaAtt.unita || null,
      ...(vedeImporti ? { prezzoCent } : {}),
      incluso: nuovaAtt.incluso,
      addettoId: nuovaAtt.addettoId || null,
    });
    if (j) { setMsg("Attività aggiunta."); setNuovaAtt({ tipo: "", priorita: 2, note: "", dataPrevista: "", quantita: "", unita: "", prezzoEuro: "", incluso: false, addettoId: "" }); }
  };

  const stornaAttivita = async (a: any) => {
    const ok = await conferma.chiedi({ titolo: "Stornare l’attività?", messaggio: `L’addebito di ${a.tipo} viene rimosso e il lavoro riaperto.`, dettaglio: "Un addebito già pagato non può essere stornato con questa operazione.", confermaLabel: "Storna e riapri", pericoloso: true });
    if (ok) await api(`/api/v1/ormeggio/attivita/${a.id}`, "PATCH", { storno: true, stato: "in_corso" });
  };
  const cambiaStatoAtt = (a: any, stato: string) => api(`/api/v1/ormeggio/attivita/${a.id}`, "PATCH", { stato });

  const pagaAddebito = async (a: { id: string; descrizione: string; residuoCent: number; incassatoCent: number; incassoDaVerificare: boolean }) => {
    if (busy) return;
    const v = await modulo.apri("Registra il pagamento", [
      { nome: "metodo", etichetta: "Metodo di pagamento", valore: "contanti", opzioni: [{ valore: "contanti", label: "Contanti" }, { valore: "pos", label: "POS" }, { valore: "bonifico", label: "Bonifico" }] },
      { nome: "dataIncasso", etichetta: "Data dell'incasso", tipo: "date", valore: oggi() },
    ], { confermaLabel: "Conferma pagamento", descrizione: `${a.descrizione}: registreremo il pagamento di ${euro(a.residuoCent)} e la voce passerà in «Pagato».${a.incassatoCent > 0 ? ` Già coperti ${euro(a.incassatoCent)} con i pagamenti presenti.` : ""}${a.incassoDaVerificare ? " La voce era segnata pagata senza un incasso corrispondente: verifica metodo e data del denaro ricevuto." : ""}` });
    if (!v) return;
    if (!v.dataIncasso) { setErr("Indica la data dell'incasso."); return; }
    const j = await api(`/api/v1/ormeggio/addebiti/${a.id}`, "PATCH", { stato: "pagato", metodo: v.metodo, dataIncasso: v.dataIncasso, incassoAttesoCent: a.residuoCent });
    if (j) setMsg(j.incassoCreatoCent > 0 ? `Pagamento di ${euro(j.incassoCreatoCent)} registrato. Voce spostata in «Pagato».` : "Voce già coperta dai pagamenti presenti. Conto aggiornato.");
  };

  const aggiungiIncasso = async (e: React.FormEvent) => {
    e.preventDefault();
    const cent = Math.round(Number(nuovoIncasso.importoEuro.replace(",", ".")) * 100);
    const j = await api("/api/v1/ormeggio/incassi", "POST", { permanenzaId: id, importoCent: cent, metodo: nuovoIncasso.metodo, descrizione: nuovoIncasso.descrizione || null });
    if (j) { setMsg("Pagamento registrato. Conto aggiornato."); setNuovoIncasso({ importoEuro: "", metodo: "contanti", descrizione: "" }); }
  };
  const aggiungiAddebito = async (e: React.FormEvent) => {
    e.preventDefault();
    const cent = Math.round(Number(nuovoAddebito.importoEuro.replace(",", ".")) * 100);
    const j = await api("/api/v1/ormeggio/addebiti", "POST", { permanenzaId: id, descrizione: nuovoAddebito.descrizione, importoCent: cent, origine: nuovoAddebito.origine });
    if (j) { setMsg("Voce aggiunta al conto."); setNuovoAddebito({ descrizione: "", importoEuro: "", origine: "altro" }); }
  };

  if (!dati || dati.id !== id) return <div className="grid gap-3"><a className="text-sm font-bold text-ocean" href="/gestionale/ormeggio">← Griglia</a>{err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}{!err && <p className="text-sm text-muted">Carico la scheda…</p>}</div>;

  const c = dati.conto ?? { totaleAddebitiCent: 0, incassatoCent: 0, residuoCent: 0 };
  const daPagare = dati.addebiti.filter((a: { residuoCent: number }) => a.residuoCent > 0);
  const pagati = dati.addebiti.filter((a: { residuoCent: number }) => a.residuoCent === 0);

  return (
    <div className="grid gap-4">
      {tab === "attivita" && <Link className="justify-self-start text-sm font-semibold text-ocean hover:underline" href="/gestionale/ormeggio/da-fare">← Tutte le attività</Link>}
      {dati.boat?.archiviato && <Avviso tono="info">Barca rimossa dagli elenchi operativi. La sosta è chiusa; restano disponibili storico, documenti e gestione del conto.</Avviso>}
      {dati.postoFuoriGriglia && <Avviso tono="info" azione={dati.stato === "attiva" ? <button className="btn-soft shrink-0" disabled={busy} onClick={sposta}>Sposta barca</button> : undefined}>Il posto precedente è stato rimosso dalla griglia. Sosta, attività e conto sono conservati. Usa «Sposta barca» per assegnare un nuovo posto.</Avviso>}
      <IntestazioneOrmeggio titolo={`${dati.boat?.nome} · ${dati.posto?.codice ?? "Senza posto"}`} descrizione={`${dati.boat?.proprietario?.nome ?? "Proprietario non indicato"} · ${dati.posto?.area?.nome ?? "Area non assegnata"} · ${dati.stato === "attiva" ? "Sosta attiva" : "Sosta chiusa"}`} azioni={<>
        {dati.stato === "attiva" && <>
          <button className="btn-soft" disabled={busy} onClick={() => movimento("uscita")}>↗ Uscita</button>
          <button className="btn-soft" disabled={busy} onClick={() => movimento("rientro")}>↙ Rientro</button>
          <button className={dati.pronta ? "btn-primary" : "btn-soft"} disabled={busy} onClick={() => api(`/api/v1/ormeggio/permanenze/${id}`, "PATCH", { azione: "aggiorna", pronta: !dati.pronta })}>{dati.pronta ? "✓ Pronta" : "Segna pronta"}</button>
        </>}
        <button className="btn-soft" disabled={busy} onClick={() => { setErr(""); carica(); }}>Aggiorna</button>
      </>} />
      <details className="card px-3 py-2" open={documentiAperti} onToggle={(e) => setDocumentiAperti(e.currentTarget.open)}>
        <summary>Gestisci sosta, documenti e contatto</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          {dati.stato === "attiva" && <button className="btn-soft" disabled={busy} onClick={sposta}>⇄ Sposta barca</button>}
          {vedeImporti && <><button className="btn-soft" disabled={busy} onClick={generaContratto}>Contratto</button><a className="btn-soft" href={`/api/v1/ormeggio/permanenze/${id}/riepilogo`}>Riepilogo PDF</a></>}
          <button className="btn-soft" disabled={busy} onClick={apriWhatsapp}>WhatsApp</button>
          {dati.stato === "attiva" && <button className="btn-soft text-coral" disabled={busy} onClick={chiudi}>Chiudi sosta</button>}
        </div>
      </details>

      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      <div className="flex gap-2 text-sm">
        {(["scheda", "attivita", "conto"] as const).filter((t) => t !== "conto" || vedeImporti).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 font-bold ${tab === t ? "bg-deep text-white" : "border border-line bg-white text-muted"}`}>
            {t === "scheda" ? "Scheda" : t === "attivita" ? "Attività" : "Conto"}
          </button>
        ))}
      </div>

      {tab === "scheda" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card grid gap-2 p-4 text-sm">
            <h2 className="text-lg">Sosta</h2>
            <p>Proprietario: <b>{dati.boat?.proprietario?.nome ?? "—"}</b> {dati.boat?.proprietario?.telefono ? `· ${dati.boat.proprietario.telefono}` : ""}</p>
            <p>Barca: <b>{dati.boat?.nome}</b> {dati.boat?.tipo ? `(${dati.boat.tipo})` : ""}</p>
            <p>Posto: <b>{dati.posto?.codice}</b> · {dati.posto?.area?.nome}</p>
            <p>Tipo: <b>{dati.tipo === "rimessaggio_custodia" ? "Rimessaggio (custodia)" : "Ormeggio (custodia)"}</b></p>
            <p>Inizio: <b>{dataIt(dati.inizioAt)}</b></p>
            <p>Fine prevista: <b>{dati.finePrevistaAt ? dataIt(dati.finePrevistaAt) : "indeterminata"}</b>{dati.fineAt ? ` · chiusa il ${dataIt(dati.fineAt)}` : ""}</p>
            {vedeImporti ? <CorrispettivoSosta key={id} cent={dati.corrispettivoCent} puoModificare={utente?.role === "owner" || utente?.role === "operatore"} busy={busy} contrattoPresente={!!dati.contratto} onSalva={async (cent) => {
              const j = await api(`/api/v1/ormeggio/permanenze/${id}`, "PATCH", { azione: "aggiorna", corrispettivoCent: cent, rettifica: true });
              if (j) setMsg("Prezzo della sosta e conto aggiornati.");
              return !!j;
            }} /> : <p>Corrispettivo: <b>importi non visibili</b></p>}
            <p>Stato lavori: <b>{dati.pronta ? "pronta (confermata)" : "in lavorazione / da confermare"}</b></p>
            <p>Contratto: <b>{!vedeImporti ? "Riservato al personale autorizzato" : dati.contratto ? (dati.contratto.firmatoAt ? `firmato da ${dati.contratto.firmaNome} il ${dataIt(dati.contratto.firmatoAt)}` : "in attesa di firma") : "non ancora generato"}</b></p>
          </div>
          <div className="card grid gap-2 p-4 text-sm">
            <h2 className="text-lg">Barca</h2>
            <p className="text-muted">Il tipo aggiorna la sagoma e i nuovi documenti. I contratti firmati conservano la versione acquisita.</p>
            <label className="grid gap-1"><span className="text-xs font-semibold text-muted">Nome barca *</span><input className="campo" maxLength={120} value={bnome} onChange={(e) => setBnome(e.target.value)} /></label>
            <label className="grid gap-1"><span className="text-xs font-semibold text-muted">Tipo di barca</span>
              <Combo
                testo={btipo}
                onTesto={setBtipo}
                onSeleziona={(o) => setBtipo(o.etichetta)}
                opzioni={OPZIONI_TIPI}
                placeholder="es. gozzo, open, gommone…"
                className="rounded-md border border-line p-2"
              />
            </label>

            <button className="btn-soft justify-self-start" disabled={busy || !bnome.trim()} onClick={async () => { const j = await salvaBarca({ nome: bnome.trim(), tipo: btipo.trim() || null, tipoCodice: codiceDaTesto(btipo) }); if (j) { setBtipo(j.tipo ?? ""); setMsg("Barca aggiornata. La griglia usa il nuovo tipo."); } }}>Salva dati barca</button>
          </div>
          <div className="card grid gap-2 p-4 text-sm md:col-span-2">
            <h2 className="text-lg">Movimenti e storico posti</h2>
            {dati.movimenti.length === 0 && <p className="text-muted">Nessun movimento.</p>}
            {dati.movimenti.map((m: any) => (
              <p key={m.id}>{m.tipo.replace("_", " ")} · <b>{dataIt(m.effettivoAt ?? m.previstoAt)}</b>{m.note ? ` · ${m.note}` : ""}</p>
            ))}
            {dati.note && <p className="border-t border-line pt-2"><b>Note:</b> {dati.note}</p>}
            <p className="mt-2 text-muted">La barca in mare mantiene il posto. La chiusura definitiva libera il posto.</p>
          </div>
        </div>
      )}

      {tab === "attivita" && (
        <div className="grid gap-4">
          {erroreCatalogo && <Avviso tono="errore" azione={<button className="btn-soft" onClick={() => preparaCatalogo()}>Riprova</button>}>{erroreCatalogo}</Avviso>}
          {!dati.boat?.archiviato && <details className="card p-3" open={nuovaAttivitaAperta} onToggle={(e) => setNuovaAttivitaAperta(e.currentTarget.open)}><summary>＋ Nuova attività</summary>
          <form className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4 xl:items-end" onSubmit={aggiungiAttivita}>
            <label className="grid gap-1"><span className="text-xs font-semibold text-muted">Servizio / lavoro *</span>
              <input list="servizi" className="rounded-md border border-line p-2" placeholder="es. Lavaggio" value={nuovaAtt.tipo} onChange={(e) => { const s = servizi.find((s) => s.nome === e.target.value); setNuovaAtt({ ...nuovaAtt, tipo: e.target.value, ...(s ? { unita: s.unita ?? "", prezzoEuro: vedeImporti && s.prezzoCent != null ? (s.prezzoCent / 100).toFixed(2) : "" } : {}) }); }} required />
              <datalist id="servizi">{servizi.map((s) => <option key={s.id} value={s.nome} />)}</datalist>
            </label>
            <label className="grid gap-1"><span className="text-xs font-semibold text-muted">Data prevista</span>
              <input type="date" className="rounded-md border border-line p-2" value={nuovaAtt.dataPrevista} onChange={(e) => setNuovaAtt({ ...nuovaAtt, dataPrevista: e.target.value })} />
            </label>
            <label className="grid gap-1"><span className="text-xs font-semibold text-muted">Qtà</span>
              <input className="rounded-md border border-line p-2" value={nuovaAtt.quantita} onChange={(e) => setNuovaAtt({ ...nuovaAtt, quantita: e.target.value })} placeholder="40" />
            </label>
            <label className="grid gap-1"><span className="text-xs font-semibold text-muted">Unità</span>
              <input className="rounded-md border border-line p-2" value={nuovaAtt.unita} onChange={(e) => setNuovaAtt({ ...nuovaAtt, unita: e.target.value })} placeholder="litri" />
            </label>
            {vedeImporti && <label className="grid gap-1"><span className="text-xs font-semibold text-muted">Prezzo € / unità</span>
              <input className="rounded-md border border-line p-2" value={nuovaAtt.prezzoEuro} onChange={(e) => setNuovaAtt({ ...nuovaAtt, prezzoEuro: e.target.value })} placeholder="1,80" />
            </label>}
            <label className="flex items-center gap-2 pb-2"><input type="checkbox" checked={nuovaAtt.incluso} onChange={(e) => setNuovaAtt({ ...nuovaAtt, incluso: e.target.checked })} /> incluso nella custodia</label>
            {addetti.length > 0 && <label className="grid gap-1"><span className="text-xs font-semibold text-muted">Addetto</span><select className="campo" value={nuovaAtt.addettoId} onChange={(e) => setNuovaAtt({ ...nuovaAtt, addettoId: e.target.value })}><option value="">Non assegnata</option>{addetti.filter((a) => a.role === "owner" || a.role === "operatore").map((a) => <option key={a.id} value={a.id}>{a.nome ?? a.email}</option>)}</select></label>}
            <div className="sm:col-span-2"><SceltaPriorita valore={nuovaAtt.priorita} onChange={(priorita) => setNuovaAtt({ ...nuovaAtt, priorita })} disabled={busy} /></div>
            <label className="grid gap-1 sm:col-span-2"><span className="text-xs font-semibold text-muted">Note attività</span><textarea aria-label="Note attività" className="campo" rows={2} maxLength={1000} value={nuovaAtt.note} onChange={(e) => setNuovaAtt({ ...nuovaAtt, note: e.target.value })} placeholder="Indicazioni per chi esegue il lavoro…" /></label>
            <div><button className="btn-primary w-full" type="submit" disabled={busy}>＋ Aggiungi attività</button></div>
          </form>
          </details>}

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted"><tr className="text-left"><th className="p-2">Servizio</th><th className="p-2">Data</th><th className="p-2">Qtà</th>{vedeImporti && <th className="p-2">Prezzo</th>}<th className="p-2">Incluso</th><th className="p-2">Stato</th><th className="p-2">Azioni</th></tr></thead>
              <tbody>
                {dati.attivita.map((a: any) => (
                  <tr key={a.id} id={`attivita-${a.id}`} className={`border-t border-line ${attivitaEvidenziata === `attivita-${a.id}` ? "!bg-[#fff0cc]" : ""}`}>
                    <td className="p-2 font-semibold"><p>{a.tipo}</p><StellePriorita valore={a.priorita} />{a.note && <details className="mt-1 font-normal"><summary className="cursor-pointer text-xs text-ocean">Note</summary><p className="max-w-sm whitespace-pre-wrap break-words text-xs text-muted">{a.note}</p></details>}</td>
                    <td className="p-2">{a.dataPrevista ? new Date(a.dataPrevista).toLocaleDateString("it-IT") : "—"}</td>
                    <td className="p-2">{a.quantita ?? "—"}{a.unita ? ` ${a.unita}` : ""}</td>
                    {vedeImporti && <td className="p-2">{a.prezzoCent != null ? euro(a.prezzoCent) : "—"}</td>}
                    <td className="p-2">{a.incluso ? "sì" : "no"}</td>
                    <td className="p-2">
                      <span className={a.stato === "completato" ? "badge-ready" : a.stato === "in_corso" ? "badge-pending" : "badge-block"}>{a.stato.replace("_", " ")}</span>
                    </td>
                    <td className="p-2">
                      <div className="flex gap-2 font-bold">
                        {!dati.boat?.archiviato && a.stato === "da_fare" && <button className="text-ocean" disabled={busy} onClick={() => cambiaStatoAtt(a, "in_corso")}>Avvia</button>}
                        {!dati.boat?.archiviato && a.stato === "in_corso" && (vedeImporti || !a.completamentoRiservato) && <button className="text-[#177469]" disabled={busy} onClick={() => cambiaStatoAtt(a, "completato")}>Completa</button>}
                        {!dati.boat?.archiviato && a.stato === "completato" && !a.addebito && !a.contabilizzata && <button className="text-muted" disabled={busy} onClick={() => cambiaStatoAtt(a, "in_corso")}>Riapri</button>}
                        {a.addebito && vedeImporti && (a.addebito.pagamentoPresente ? <span className="text-xs text-muted">Addebito già incassato</span> : <button className="text-coral" disabled={busy} onClick={() => stornaAttivita(a)}>Storna e riapri</button>)}
                        {!vedeImporti && a.completamentoRiservato && a.stato !== "completato" && <span className="text-xs text-muted">Completamento con addebito: personale autorizzato</span>}
                      </div>
                    </td>
                  </tr>
                ))}
                {dati.attivita.length === 0 && <tr><td className="p-3 text-muted" colSpan={vedeImporti ? 7 : 6}>Nessuna attività.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "conto" && (
        <div className="grid gap-4">
          <dl className="card grid grid-cols-3 gap-2 p-3 text-sm">{[{ nome: "Totale", cent: c.totaleAddebitiCent }, { nome: "Pagato", cent: c.incassatoCent }, { nome: "Da pagare", cent: c.residuoCent }].map((v) => <div key={v.nome} className="min-w-0"><dt className="text-muted">{v.nome}</dt><dd className="mt-1 break-words font-bold">{euro(v.cent)}</dd></div>)}</dl>
          {c.creditoCent > 0 && <Avviso tono="info">Credito sul conto: {euro(c.creditoCent)}. Verrà usato per coprire le prossime voci da pagare di questa sosta.</Avviso>}
          {dati.addebiti.some((a: { incassoDaVerificare?: boolean }) => a.incassoDaVerificare) && <Avviso tono="attenzione">Alcune voci erano segnate pagate senza un incasso sufficiente. Verifica il denaro ricevuto e usa «Registra incasso» indicando metodo e data corretti.</Avviso>}

          <details className="card p-3"><summary>＋ Nuova voce da pagare</summary>
          <form className="mt-3 grid gap-2 text-sm md:grid-cols-4" onSubmit={aggiungiAddebito}>
            <input className="rounded-md border border-line p-2 md:col-span-2" placeholder="Descrizione (es. Lavaggio)" value={nuovoAddebito.descrizione} onChange={(e) => setNuovoAddebito({ ...nuovoAddebito, descrizione: e.target.value })} required />
            <input className="rounded-md border border-line p-2" placeholder="Importo €" value={nuovoAddebito.importoEuro} onChange={(e) => setNuovoAddebito({ ...nuovoAddebito, importoEuro: e.target.value })} required />
            <button className="btn-primary" type="submit" disabled={busy}>＋ Da pagare</button>
          </form>
          </details>

          <div className="card overflow-x-auto" data-conto-sezione="da-pagare">
            <div className="border-b border-line p-3 text-sm font-bold">Da pagare</div>
            <table className="block w-full text-sm md:table">
              <thead className="hidden md:table-header-group"><tr className="text-left text-muted"><th className="p-2">Voce</th><th className="p-2">Origine</th><th className="p-2">Data</th><th className="p-2">Importo</th><th className="p-2">Stato</th><th className="p-2">Pagamento</th></tr></thead>
              <tbody className="block md:table-row-group">
                {daPagare.map((a: any) => (
                  <tr key={a.id} id={`addebito-${a.id}`} data-addebito-id={a.id} className="grid grid-cols-2 items-center gap-1 border-t border-line p-3 md:table-row md:p-0">
                    <td className="col-span-2 min-w-0 break-words font-semibold md:p-2 md:font-normal">{a.descrizione}</td>
                    <td className="text-xs text-muted md:p-2 md:text-sm">{a.origine}</td>
                    <td className="text-right text-xs text-muted md:p-2 md:text-left md:text-sm">{new Date(a.data).toLocaleDateString("it-IT")}</td>
                    <td className="min-w-0 py-2 md:p-2"><b>{euro(a.importoCent)}</b>{a.incassatoCent > 0 && a.residuoCent > 0 && <span className="block text-xs text-muted">Coperto {euro(a.incassatoCent)} · Rimane {euro(a.residuoCent)}</span>}</td>
                    <td className="min-w-0 text-right md:p-2 md:text-left"><span className={a.stato === "pagato" ? "badge-ready" : "badge-pending"}>{a.incassoDaVerificare ? "Incasso da verificare" : a.importoCent <= 0 ? "Non dovuto" : a.stato === "pagato" ? "Pagato" : a.incassatoCent > 0 ? "Parziale" : "Da pagare"}</span></td>
                    <td className="col-span-2 md:p-2">{a.residuoCent > 0 && <button disabled={busy} className="min-h-11 font-bold text-ocean md:min-h-0" onClick={() => pagaAddebito(a)}>{a.incassoDaVerificare ? "Registra incasso" : "Segna pagato"}</button>}</td>
                  </tr>
                ))}
                {daPagare.length === 0 && <tr><td colSpan={6} className="p-3 text-muted">Nessuna voce da pagare.</td></tr>}
              </tbody>
            </table>
          </div>

          <details className="card p-3"><summary>＋ Registra pagamento esterno</summary>
          <form className="mt-3 grid gap-2 text-sm md:grid-cols-4" onSubmit={aggiungiIncasso}>
            <input className="rounded-md border border-line p-2" placeholder="Importo pagato €" value={nuovoIncasso.importoEuro} onChange={(e) => setNuovoIncasso({ ...nuovoIncasso, importoEuro: e.target.value })} required />
            <select className="rounded-md border border-line p-2" value={nuovoIncasso.metodo} onChange={(e) => setNuovoIncasso({ ...nuovoIncasso, metodo: e.target.value })}>
              <option value="contanti">Contanti</option><option value="pos">POS</option><option value="bonifico">Bonifico</option>
            </select>
            <input className="rounded-md border border-line p-2" placeholder="Nota" value={nuovoIncasso.descrizione} onChange={(e) => setNuovoIncasso({ ...nuovoIncasso, descrizione: e.target.value })} />
            <button className="btn-primary" type="submit" disabled={busy}>＋ Pagamento esterno</button>
          </form>
          </details>

          <div className="card overflow-x-auto" data-conto-sezione="pagato">
            <div className="border-b border-line p-3 text-sm font-bold">Pagato</div>
            <table className="block w-full text-sm md:table">
              <thead className="hidden md:table-header-group"><tr className="text-left text-muted"><th className="p-2">Voce</th><th className="p-2">Origine</th><th className="p-2">Data</th><th className="p-2">Importo</th><th className="p-2">Stato</th></tr></thead>
              <tbody className="block md:table-row-group">
                {pagati.map((a: any) => (
                  <tr key={a.id} id={`addebito-${a.id}`} data-addebito-id={a.id} className="grid grid-cols-2 items-center gap-1 border-t border-line p-3 md:table-row md:p-0">
                    <td className="col-span-2 min-w-0 break-words font-semibold md:p-2 md:font-normal">{a.descrizione}</td>
                    <td className="text-xs text-muted md:p-2 md:text-sm">{a.origine}</td>
                    <td className="text-right text-xs text-muted md:p-2 md:text-left md:text-sm">{new Date(a.data).toLocaleDateString("it-IT")}</td>
                    <td className="min-w-0 py-2 md:p-2"><b>{euro(a.importoCent)}</b></td>
                    <td className="text-right md:p-2 md:text-left"><span className="badge-ready">{a.importoCent <= 0 ? "Non dovuto" : "Pagato"}</span></td>
                  </tr>
                ))}
                {pagati.length === 0 && <tr><td colSpan={5} className="p-3 text-muted">Nessuna voce saldata.</td></tr>}
              </tbody>
            </table>
            <details className="border-t border-line" open={pagati.length === 0}>
            <summary className="p-3 text-sm font-semibold">Dettaglio pagamenti</summary>
            <table className="block w-full text-sm md:table">
              <thead className="hidden md:table-header-group"><tr className="text-left text-muted"><th className="p-2">Data e riferimento</th><th className="p-2">Metodo</th><th className="p-2">Importo</th><th className="p-2">Stato</th></tr></thead>
              <tbody className="block md:table-row-group">
                {dati.payments.map((p: any) => (
                  <tr key={p.id} className="grid grid-cols-2 items-center gap-2 border-t border-line p-3 md:table-row md:p-0">
                    <td className="col-span-2 min-w-0 break-words md:p-2">{new Date(p.paidAt ?? p.createdAt).toLocaleDateString("it-IT")}{p.descrizione && <span className="block text-xs text-muted">{p.addebitoId ? <a className="text-ocean underline" href={`#addebito-${p.addebitoId}`}>{p.descrizione}</a> : p.descrizione}</span>}</td>
                    <td className="min-w-0 text-muted md:p-2">{p.provider} · {p.metodo}</td>
                    <td className="text-right font-bold md:p-2 md:text-left">{euro(p.totaleCent)}</td>
                    <td className="col-span-2 md:p-2"><span className={p.stato === "pagato" ? "badge-ready" : "badge-pending"}>{p.stato}</span></td>
                  </tr>
                ))}
                {dati.payments.length === 0 && <tr><td colSpan={4} className="p-3 text-muted">Nessun pagamento registrato.</td></tr>}
              </tbody>
            </table>
            </details>
          </div>
          <p className="text-xs text-muted">Le voci saldate passano da «Da pagare» a «Pagato», anche quando registri un pagamento esterno o online. Le voci pagate in parte restano in «Da pagare» con il residuo. «Segna pagato» registra solo quanto manca; non serve un secondo pagamento.</p>
        </div>
      )}
      {conferma.dialogo}
      {modulo.dialogo}
    </div>
  );
}

export default function SchedaPermanenzaPage() {
  const u = useUtente();
  const { id } = useParams<{ id: string }>();
  if (!u) return <p className="text-sm text-muted">Caricamento…</p>;
  if (u.role !== "owner" && u.role !== "superadmin" && u.ruoloOrmeggio === "visualizzazione") return <Avviso tono="attenzione">Questo profilo non è più disponibile. Chiedi al titolare di assegnarti il ruolo Responsabile o Addetto.</Avviso>;
  if (u.role !== "owner" && u.ruoloOrmeggio === "addetto") return <OperazioniAddetto permanenzaId={id} />;
  return <SchedaCompleta />;
}
