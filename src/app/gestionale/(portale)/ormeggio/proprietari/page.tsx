"use client";
import { useEffect, useState } from "react";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";
import { ErroreRecuperabile } from "@/components/ui/ErroreRecuperabile";
import { StatoVuoto } from "@/components/ui/StatoVuoto";
import { Icona } from "@/components/ui/Icona";

type Proprietario = {
  id: string;
  nome: string;
  telefono: string | null;
  email: string | null;
  note: string | null;
  boats: { id: string; nome: string }[];
};

export default function ProprietariPage() {
  const [proprietari, setProprietari] = useState<Proprietario[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ nome: "", telefono: "", email: "", note: "" });

  const carica = async (ricerca = "") => {
    setErr("");
    const r = await fetch(`/api/v1/ormeggio/proprietari${ricerca ? `?q=${encodeURIComponent(ricerca)}` : ""}`);
    const j = await r.json().catch(() => null);
    if (!r.ok || !Array.isArray(j)) {
      setErr(j?.error ?? "Non riesco a leggere l'elenco dei proprietari.");
      setProprietari([]);
      return;
    }
    setProprietari(j);
  };
  useEffect(() => {
    carica();
  }, []);

  const crea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim()) return;
    setBusy(true);
    setErr("");
    const r = await fetch("/api/v1/ormeggio/proprietari", {
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
    carica();
  };

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm text-muted">Ormeggio</p>
        <h1 className="text-2xl">Proprietari</h1>
        <p className="text-sm text-muted">Contatti e barche in custodia di ogni proprietario.</p>
      </div>

      {err && <ErroreRecuperabile messaggio={err} onRiprova={() => carica()} />}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      <form className="card grid gap-3 p-4 md:grid-cols-12 md:items-end" onSubmit={crea}>
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
      </form>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
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
              setQ("");
              carica("");
            }}
          >
            Azzera
          </button>
        )}
      </form>

      {proprietari === null ? (
        <Caricamento testo="Carico i proprietari…" />
      ) : proprietari.length === 0 && !err ? (
        <StatoVuoto
          icona="utente"
          titolo="Nessun proprietario in elenco"
          testo="Aggiungi il primo proprietario dal modulo qui sopra: potrai collegarlo alle barche in custodia e alle permanenze."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {proprietari.map((p) => (
            <article key={p.id} className="card grid gap-2 p-4">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-foam font-bold text-ocean">{p.nome.charAt(0).toUpperCase()}</span>
                <p className="font-display font-bold">{p.nome}</p>
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
                    <span key={b.id} className="chip">
                      <Icona nome="barca" className="h-3.5 w-3.5" /> {b.nome}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">Nessuna barca collegata.</p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
