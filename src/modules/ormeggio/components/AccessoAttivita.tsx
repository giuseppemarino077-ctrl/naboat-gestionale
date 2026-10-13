"use client";
import { richiestaOrmeggio } from "@/modules/ormeggio/richiesta";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avviso } from "@/components/ui/Avviso";
import { Combo } from "@/components/ui/Combo";
import { useAggiornamenti } from "@/lib/aggiorna";

type Contatto = { id: string; nome: string; telefono: string | null; email: string | null };
type Sosta = {
  id: string; stato: string; inizioAt: string; finePrevistaAt: string | null; fineAt: string | null;
  posto: { codice: string; area: { nome: string; archiviata: boolean } } | null;
};
type Barca = { id: string; nome: string; permanenze: Sosta[] };
type Cliente = Contatto & { boats: Barca[] };

function sostaSuggerita(soste: Sosta[]) {
  const adesso = Date.now();
  const corrente = soste.find((s) => s.stato === "attiva" && new Date(s.inizioAt).getTime() <= adesso && (!s.finePrevistaAt || new Date(s.finePrevistaAt).getTime() > adesso));
  const futura = soste.filter((s) => s.stato === "attiva" && new Date(s.inizioAt).getTime() > adesso).sort((a, b) => a.inizioAt.localeCompare(b.inizioAt))[0];
  return (corrente ?? futura ?? soste[0])?.id ?? "";
}

function etichettaSosta(sosta: Sosta) {
  const data = (v: string) => new Date(v).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" });
  const fine = sosta.fineAt ?? sosta.finePrevistaAt;
  return `${data(sosta.inizioAt)} → ${fine ? data(fine) : "senza scadenza"} · ${sosta.stato === "chiusa" ? "chiusa" : "attiva"} · ${sosta.posto ? `${sosta.posto.area.nome}, ${sosta.posto.codice}${sosta.posto.area.archiviata ? " (area rimossa)" : ""}` : "senza posto"}`;
}

export function AccessoAttivita({ mostraTitolo = true }: { mostraTitolo?: boolean }) {
  const [ricerca, setRicerca] = useState("");
  const [contatti, setContatti] = useState<Contatto[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [barcaId, setBarcaId] = useState("");
  const [sostaId, setSostaId] = useState("");
  const [caricamento, setCaricamento] = useState(true);
  const [caricamentoBarche, setCaricamentoBarche] = useState(false);
  const [errore, setErrore] = useState("");
  const [revisione, setRevisione] = useState(0);

  useAggiornamenti(() => { if (!document.activeElement?.matches("input, select, textarea")) setRevisione((v) => v + 1); }, ["ormeggio"]);

  useEffect(() => {
    if (clienteId) { setCaricamento(false); return; }
    const controller = new AbortController();
    setCaricamento(true); setErrore(""); setContatti([]);
    const timer = setTimeout(async () => {
      try {
        const r = await richiestaOrmeggio(`/api/v1/ormeggio/proprietari?q=${encodeURIComponent(ricerca.trim())}`, { signal: controller.signal });
        const j = await r.json();
        if (controller.signal.aborted) return;
        if (!r.ok || !Array.isArray(j)) { setErrore(j.error ?? "Non riesco a leggere i clienti."); return; }
        setContatti(j);
      } catch { if (!controller.signal.aborted) setErrore("Connessione interrotta. Riprova a caricare i clienti."); }
      finally { if (!controller.signal.aborted) setCaricamento(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [ricerca, clienteId, revisione]);

  useEffect(() => {
    if (!clienteId) { setCliente(null); setCaricamentoBarche(false); return; }
    const controller = new AbortController();
    setCaricamentoBarche(true); setErrore("");
    const carica = async () => {
      try {
        const r = await richiestaOrmeggio(`/api/v1/ormeggio/proprietari/${clienteId}`, { signal: controller.signal });
        const j = await r.json();
        if (controller.signal.aborted) return;
        if (!r.ok || !Array.isArray(j.boats)) { setCliente(null); setBarcaId(""); setSostaId(""); setErrore(j.error ?? "Non riesco a leggere le barche del cliente."); return; }
        setCliente(j);
      } catch { if (!controller.signal.aborted) { setCliente(null); setErrore("Connessione interrotta. Riprova a caricare le barche."); } }
      finally { if (!controller.signal.aborted) setCaricamentoBarche(false); }
    };
    carica();
    return () => controller.abort();
  }, [clienteId, revisione]);

  const barca = cliente?.boats.find((b) => b.id === barcaId);
  const sosta = barca?.permanenze.find((s) => s.id === sostaId);
  const href = sosta && !caricamentoBarche ? `/gestionale/ormeggio/permanenza/${sosta.id}?tab=attivita` : null;

  return (
    <section aria-labelledby="accesso-attivita" className="rounded-2xl border border-ocean/20 bg-gradient-to-br from-foam to-white p-4 sm:p-5">
      {mostraTitolo && <h2 id="accesso-attivita" className="text-lg font-bold text-deep">Apri le attività di una barca</h2>}
      <p className="mt-1 text-sm text-muted">Scegli il cliente, poi la sua barca. Servizi, lavori e addebiti restano collegati alla stessa sosta del quadro posti.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="grid content-start gap-1 text-sm">
          <p className="font-semibold text-deep">1. Cliente</p>
          <Combo
            ariaLabel="Cliente per le attività"
            testo={ricerca}
            onTesto={(v) => { setRicerca(v); setClienteId(""); setCliente(null); setBarcaId(""); setSostaId(""); }}
            onSeleziona={(v) => { setClienteId(v.valore); setCliente(null); setBarcaId(""); setSostaId(""); }}
            opzioni={contatti.map((p) => ({ valore: p.id, etichetta: p.nome, dettaglio: p.email?.toLowerCase().includes(ricerca.trim().toLowerCase()) && ricerca.trim() ? p.email : p.telefono ?? p.email ?? "" }))}
            placeholder="Cerca nome, telefono o email…"
            className="campo"
            max={50}
          />
          <p className="text-xs text-muted" aria-live="polite">{clienteId ? "Cliente selezionato. Scegli una delle sue barche." : caricamento ? "Cerco i clienti…" : contatti.length >= 50 ? "Primi 50 clienti: scrivi per restringere la ricerca." : contatti.length ? "Seleziona un cliente dai suggerimenti." : "Nessun cliente trovato."}</p>
        </div>
        <label className="grid content-start gap-1 text-sm">
          <span className="font-semibold text-deep">2. Barca</span>
          <select aria-label="Barca per le attività" className="campo min-w-0" value={barca?.id ?? ""} disabled={!cliente || caricamentoBarche} onChange={(e) => { const b = cliente?.boats.find((b) => b.id === e.target.value); setBarcaId(e.target.value); setSostaId(sostaSuggerita(b?.permanenze ?? [])); }}>
            <option value="">{caricamentoBarche ? "Carico le barche…" : "Scegli la barca…"}</option>
            {cliente?.boats.map((b) => <option key={b.id} value={b.id}>{b.nome}{!b.permanenze.length ? " · nessuna sosta" : ""}</option>)}
          </select>
          {cliente && !caricamentoBarche && !cliente.boats.length && <span className="text-xs text-muted">Questo cliente non ha barche in custodia. Registra la sosta dal <Link className="font-semibold text-ocean underline" href="/gestionale/ormeggio">quadro posti</Link>.</span>}
        </label>
        <label className="grid content-start gap-1 text-sm md:col-span-2 xl:col-span-1">
          <span className="font-semibold text-deep">3. Sosta di riferimento</span>
          <select aria-label="Sosta per le attività" className="campo min-w-0" value={sosta?.id ?? ""} disabled={!barca?.permanenze.length || caricamentoBarche} onChange={(e) => setSostaId(e.target.value)}>
            {!sosta && <option value="">Scegli prima la barca…</option>}
            {barca?.permanenze.map((s) => <option key={s.id} value={s.id}>{etichettaSosta(s)}</option>)}
          </select>
          <span className="text-xs text-muted">{barca && !barca.permanenze.length ? "Registra una sosta dal quadro posti prima di aggiungere attività." : "Proposta la sosta corrente; puoi scegliere anche una sosta futura o lo storico."}</span>
        </label>
      </div>
      {errore && <div className="mt-3"><Avviso tono="errore" azione={<button className="btn-soft" onClick={() => setRevisione((v) => v + 1)}>Riprova</button>}>{errore}</Avviso></div>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {href ? <><Link className="btn-primary" href={href}>Apri attività →</Link><Link className="btn-soft" href={`${href}&nuova=1`}>＋ Nuova attività</Link></> : <button className="btn-primary" disabled>Apri attività →</button>}
        {sosta?.stato === "chiusa" && <p className="text-xs text-muted">Sosta chiusa: le attività si riferiscono a questo periodo storico.</p>}
      </div>
    </section>
  );
}
