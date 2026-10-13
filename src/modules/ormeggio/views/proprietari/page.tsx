"use client";
import { richiestaOrmeggio } from "@/modules/ormeggio/richiesta";

import Link from "next/link";
import { Dialogo } from "@/components/ui/Dialogo";
import { IntestazioneOrmeggio } from "@/modules/ormeggio/components/IntestazioneOrmeggio";
import { useEffect, useState } from "react";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";
import { ErroreRecuperabile } from "@/components/ui/ErroreRecuperabile";
import { StatoVuoto } from "@/components/ui/StatoVuoto";
import { Icona } from "@/components/ui/Icona";
import { useAggiornamenti, segnalaCambiamento } from "@/lib/aggiorna";

type Proprietario = {
  id: string;
  revisione: number;
  nome: string;
  telefono: string | null;
  email: string | null;
  note: string | null;
  boats: { id: string; nome: string; permanenze: { id: string; stato: string }[] }[];
};

export default function ProprietariPage() {
  const [proprietari, setProprietari] = useState<Proprietario[] | null>(null);
  const [q, setQ] = useState("");
  const [ricerca, setRicerca] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [selezionato, setSelezionato] = useState<Proprietario | null>(null);
  const [elimina, setElimina] = useState(false);
  const [erroreScheda, setErroreScheda] = useState("");
  const [modifica, setModifica] = useState({ nome: "", telefono: "", email: "", note: "" });
  const [nuovo, setNuovo] = useState(false);
  const [form, setForm] = useState({ nome: "", telefono: "", email: "", note: "" });

  const carica = async (ricerca = "") => {
    setErr("");
    try {
    const r = await richiestaOrmeggio(`/api/v1/ormeggio/proprietari${ricerca ? `?q=${encodeURIComponent(ricerca)}` : ""}`);
    const j = await r.json().catch(() => null);
    if (!r.ok || !Array.isArray(j)) {
      setErr(j?.error ?? "Non riesco a leggere l'elenco dei proprietari.");
      setProprietari([]);
      return;
    }
    setProprietari(j);
    } catch { setErr("Connessione interrotta. Riprova."); }
  };
  useEffect(() => {
    carica();
  }, []);

  useAggiornamenti(() => carica(ricerca), ["ormeggio"]);

  const crea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setBusy(true);
    setErr("");
    try {
    const r = await richiestaOrmeggio("/api/v1/ormeggio/proprietari", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: form.nome.trim(),
        telefono: form.telefono.trim() || null,
        email: form.email.trim() || null,
        note: form.note.trim() || null,
      }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setErr(j.error ?? "Non riesco a salvare il proprietario.");
      return;
    }
    setMsg(j.esistente ? `«${j.nome}» era già in elenco: nessun duplicato creato.` : `Proprietario «${j.nome}» aggiunto.`);
    setForm({ nome: "", telefono: "", email: "", note: "" });
    setNuovo(false);
    carica(ricerca);
    segnalaCambiamento("ormeggio");
    } catch { setErr("Connessione interrotta: verifica l’elenco prima di riprovare."); }
    finally { setBusy(false); }
  };

  const salvaScheda = async (method: "PATCH" | "DELETE") => {
    if (!selezionato || busy) return;
    setBusy(true); setErroreScheda("");
    try {
      const r = await richiestaOrmeggio(`/api/v1/ormeggio/proprietari/${selezionato.id}`, { method, headers: { "Content-Type": "application/json", "If-Match": String(selezionato.revisione) }, body: method === "PATCH" ? JSON.stringify({ nome: modifica.nome.trim(), telefono: modifica.telefono.trim() || null, email: modifica.email.trim() || null, note: modifica.note.trim() || null }) : undefined });
      const j = await r.json();
      if (!r.ok) { setErroreScheda(j.error ?? "Operazione non riuscita"); return; }
      setMsg(method === "DELETE" ? `Proprietario e ${j.barcheRimosse} barche rimossi. Posti attuali e futuri liberati.` : "Proprietario aggiornato.");
      setSelezionato(null); setElimina(false); await carica(ricerca); segnalaCambiamento("ormeggio");
    } catch { setErroreScheda("Connessione interrotta. Verifica l’elenco prima di riprovare."); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4">
      <IntestazioneOrmeggio titolo="Proprietari" descrizione="Contatti e accesso alle barche in custodia." azioni={<button className="btn-primary" aria-expanded={nuovo} onClick={() => setNuovo(!nuovo)}>{nuovo ? "Chiudi modulo" : "＋ Nuovo proprietario"}</button>} />

      {err && <ErroreRecuperabile messaggio={err} onRiprova={() => carica()} />}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      {nuovo && <form className="card grid gap-3 p-4 md:grid-cols-12 md:items-end" onSubmit={crea}>
        <label className="grid gap-1 text-sm md:col-span-4">
          <span className="text-xs font-semibold text-muted">Nome e cognome *</span>
          <input className="campo" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="es. Mario Rossi" />
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="text-xs font-semibold text-muted">Telefono</span>
          <input className="campo" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm md:col-span-3">
          <span className="text-xs font-semibold text-muted">Email</span>
          <input className="campo" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm md:col-span-3">
          <span className="text-xs font-semibold text-muted">Note</span>
          <input className="campo" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>
        <div className="md:col-span-3">
          <button className="btn-primary w-full" type="submit" disabled={busy || !form.nome.trim()}>
            <Icona nome="piu" className="mr-1.5 h-4 w-4" /> {busy ? "Salvo…" : "Aggiungi proprietario"}
          </button>
        </div>
      </form>}

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setRicerca(q.trim());
          carica(q.trim());
        }}
      >
        <input className="campo max-w-sm" placeholder="Cerca per nome, telefono o email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-soft" type="submit">
          <Icona nome="cerca" className="mr-1.5 h-4 w-4" /> Cerca
        </button>
        {q && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setQ(""); setRicerca("");
              carica("");
            }}
          >
            Azzera
          </button>
        )}
      </form>

      {proprietari && proprietari.length >= 50 && <p className="text-xs text-muted">Mostrati i primi 50 proprietari. Usa la ricerca per trovare altri contatti.</p>}
      {proprietari === null ? (
        <Caricamento testo="Carico i proprietari…" />
      ) : proprietari.length === 0 && !err ? (
        <StatoVuoto
          icona="utente"
          titolo="Nessun proprietario in elenco"
          testo={q ? "Nessun risultato per questa ricerca. Prova un altro nome o contatto." : "Usa Nuovo proprietario oppure registra la sosta da un posto libero nel quadro posti."}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {proprietari.map((p) => (
            <article key={p.id} className="card grid gap-2 p-4">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-foam font-bold text-ocean">{p.nome.charAt(0).toUpperCase()}</span>
                <button className="text-left font-display font-bold text-ocean hover:underline" onClick={() => { setSelezionato(p); setModifica({ nome: p.nome, telefono: p.telefono ?? "", email: p.email ?? "", note: p.note ?? "" }); setElimina(false); setErroreScheda(""); }}>{p.nome} →</button>
              </div>
              <div className="grid gap-1 text-sm text-muted">
                {p.telefono ? (
                  <a className="flex items-center gap-1.5 hover:text-ocean" href={`tel:${p.telefono}`}>
                    <Icona nome="telefono" className="h-4 w-4" /> {p.telefono}
                  </a>
                ) : null}
                {p.email ? (
                  <a className="flex items-center gap-1.5 hover:text-ocean" href={`mailto:${p.email}`}>
                    <Icona nome="mail" className="h-4 w-4" /> {p.email}
                  </a>
                ) : null}
                {!p.telefono && !p.email && <span>Nessun contatto registrato.</span>}
              </div>
              {p.note && <p className="text-xs text-muted">{p.note}</p>}
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Barche ({p.boats.length})</p>
              {p.boats.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {p.boats.map((b) => (
                    <Link key={b.id} className="chip hover:border-ocean hover:text-ocean" href={b.permanenze[0] ? `/gestionale/ormeggio/permanenza/${b.permanenze[0].id}` : `/gestionale/ormeggio?q=${encodeURIComponent(b.nome)}`}><Icona nome="barca" className="h-3.5 w-3.5" />{b.nome}{b.permanenze[0]?.stato === "chiusa" ? " · storico" : ""} →</Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">Nessuna barca collegata.</p>
              )}
            </article>
          ))}
        </div>
      )}
      <Dialogo aperto={!!selezionato} onChiudi={() => { if (!busy) setSelezionato(null); }} titolo={elimina ? "Elimina proprietario e barche" : "Scheda proprietario"}>
        {erroreScheda && <Avviso tono="errore">{erroreScheda}</Avviso>}
        {elimina ? <div className="grid gap-4">
          <p>Eliminare <b>{selezionato?.nome}</b> e tutte le sue barche in custodia?</p>
          <p className="text-sm text-muted">Le barche spariscono dagli elenchi operativi e i posti vengono liberati anche nei giorni futuri. Contratti, storico e contabilità già registrati restano consultabili in Economia.</p>
          <div className="flex gap-2"><button className="btn-soft" disabled={busy} onClick={() => setElimina(false)}>Annulla</button><button className="btn-primary !bg-danger" disabled={busy} onClick={() => salvaScheda("DELETE")}>{busy ? "Elimino…" : "Elimina proprietario e barche"}</button></div>
        </div> : <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); salvaScheda("PATCH"); }}>
          <label className="grid gap-1 text-sm">Nome e cognome *<input className="campo" required maxLength={160} value={modifica.nome} onChange={(e) => setModifica({ ...modifica, nome: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">Telefono<input className="campo" type="tel" maxLength={40} value={modifica.telefono} onChange={(e) => setModifica({ ...modifica, telefono: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">Email<input className="campo" type="email" maxLength={160} value={modifica.email} onChange={(e) => setModifica({ ...modifica, email: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">Note<textarea className="campo" maxLength={1000} value={modifica.note} onChange={(e) => setModifica({ ...modifica, note: e.target.value })} /></label>
          <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={busy || !modifica.nome.trim()}>{busy ? "Salvo…" : "Salva modifiche"}</button><button type="button" className="btn-soft text-danger" disabled={busy} onClick={() => setElimina(true)}>Elimina proprietario</button></div>
        </form>}
      </Dialogo>
    </div>
  );
}
