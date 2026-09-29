"use client";
import { useEffect, useState } from "react";

type Porto = {
  id: string;
  nome: string;
  indirizzo: string | null;
  lat: number | null;
  lon: number | null;
  note: string | null;
  orari: string | null;
  _count?: { boats: number };
};

const vuoto = { nome: "", indirizzo: "", lat: "", lon: "", note: "", orari: "" };

// Porti e basi operative dell'azienda.
export default function PortiPage() {
  const [porti, setPorti] = useState<Porto[]>([]);
  const [form, setForm] = useState({ ...vuoto });
  const [modificaId, setModificaId] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const carica = () => {
    fetch("/api/v1/porti")
      .then((r) => r.json())
      .then((j) => { if (Array.isArray(j)) setPorti(j); else setErr(j.error ?? "Errore"); })
      .catch(() => setErr("Errore di rete"));
  };
  useEffect(carica, []);

  const salva = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(""); setMsg("");
    const body: any = {
      nome: form.nome,
      indirizzo: form.indirizzo || null,
      lat: form.lat ? Number(form.lat.replace(",", ".")) : null,
      lon: form.lon ? Number(form.lon.replace(",", ".")) : null,
      note: form.note || null,
      orari: form.orari || null,
    };
    const url = modificaId ? `/api/v1/porti/${modificaId}` : "/api/v1/porti";
    const r = await fetch(url, { method: modificaId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    setMsg(modificaId ? "Porto aggiornato." : "Porto creato.");
    setForm({ ...vuoto }); setModificaId(null); carica();
  };

  const modifica = (p: Porto) => {
    setModificaId(p.id);
    setForm({
      nome: p.nome,
      indirizzo: p.indirizzo ?? "",
      lat: p.lat != null ? String(p.lat) : "",
      lon: p.lon != null ? String(p.lon) : "",
      note: p.note ?? "",
      orari: p.orari ?? "",
    });
  };

  const elimina = async (p: Porto) => {
    if (!confirm(`Eliminare il porto "${p.nome}"?`)) return;
    const r = await fetch(`/api/v1/porti/${p.id}`, { method: "DELETE" });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? "Errore"); return; }
    carica();
  };

  return (
    <div className="grid gap-5">
      <div>
        <p className="text-sm text-muted">Impostazioni aziendali</p>
        <h1 className="text-2xl">Porti e basi operative.</h1>
        <p className="mt-1 text-sm text-muted">Gli stessi dati alimentano calendario, profilo pubblico, schede barca e dettagli delle prenotazioni.</p>
      </div>

      {err && <p className="rounded-2xl border border-coral/40 bg-[#fdeeea] p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="rounded-2xl border border-[#bfe6dc] bg-[#eafaf5] p-3 text-sm font-semibold text-[#177469]">{msg}</p>}

      <form className="card grid gap-3 p-4 md:grid-cols-12 md:items-end" onSubmit={salva}>
        <h2 className="text-lg md:col-span-12">{modificaId ? "Modifica il porto" : "Aggiungi un porto o una base"}</h2>
        <label className="grid gap-1 text-sm md:col-span-4"><span className="text-xs font-semibold text-muted">Nome *</span>
          <input className="rounded-2xl border border-line p-3" placeholder="es. Porto di Napoli — Molo Luise" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
        </label>
        <label className="grid gap-1 text-sm md:col-span-5"><span className="text-xs font-semibold text-muted">Indirizzo</span>
          <input className="rounded-2xl border border-line p-3" value={form.indirizzo} onChange={(e) => setForm({ ...form, indirizzo: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm md:col-span-3"><span className="text-xs font-semibold text-muted">Orari di apertura</span>
          <input className="rounded-2xl border border-line p-3" placeholder="es. 8:00–20:00" value={form.orari} onChange={(e) => setForm({ ...form, orari: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm md:col-span-3"><span className="text-xs font-semibold text-muted">Latitudine</span>
          <input className="rounded-2xl border border-line p-3" placeholder="40.8410" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm md:col-span-3"><span className="text-xs font-semibold text-muted">Longitudine</span>
          <input className="rounded-2xl border border-line p-3" placeholder="14.2520" value={form.lon} onChange={(e) => setForm({ ...form, lon: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm md:col-span-6"><span className="text-xs font-semibold text-muted">Note per il punto d'incontro</span>
          <input className="rounded-2xl border border-line p-3" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>
        <div className="flex gap-2 md:col-span-12">
          <button className="btn-primary" type="submit">{modificaId ? "Salva modifiche" : "＋ Aggiungi porto"}</button>
          {modificaId && <button type="button" className="btn-soft" onClick={() => { setModificaId(null); setForm({ ...vuoto }); }}>Annulla</button>}
        </div>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr><th className="p-3">Nome</th><th className="p-3">Indirizzo</th><th className="p-3">Orari</th><th className="p-3">Barche</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {porti.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="p-3 font-semibold">{p.nome}</td>
                <td className="p-3 text-muted">{p.indirizzo ?? "—"}</td>
                <td className="p-3 text-muted">{p.orari ?? "—"}</td>
                <td className="p-3">{p._count?.boats ?? 0}</td>
                <td className="p-3">
                  <div className="flex gap-3 font-bold">
                    {p.lat != null && p.lon != null && (
                      <a className="text-ocean" href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`} target="_blank" rel="noreferrer">Mappa</a>
                    )}
                    <button className="text-ocean" onClick={() => modifica(p)}>Modifica</button>
                    <button className="text-coral" onClick={() => elimina(p)}>Elimina</button>
                  </div>
                </td>
              </tr>
            ))}
            {porti.length === 0 && <tr><td className="p-3 text-muted" colSpan={5}>Nessun porto configurato.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
