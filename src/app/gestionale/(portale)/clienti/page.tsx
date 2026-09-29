"use client";
import { useEffect, useState } from "react";

export default function ClientiPage() {
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<any>(null);
  // Paginazione server (retro-compatibile): prima pagina più «Mostra altri».
  const PAGE = 100;
  const [totale, setTotale] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [caricandoAltri, setCaricandoAltri] = useState(false);

  const load = (query = "") => {
    fetch(`/api/v1/customers?page=1&limit=${PAGE}${query ? `&q=${encodeURIComponent(query)}` : ""}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => {
        const items = Array.isArray(j) ? j : j?.items;
        if (Array.isArray(items)) {
          setList(items);
          setTotale(Array.isArray(j) ? items.length : (j?.totale ?? items.length));
          setPagina(1);
          setErr("");
        } else setErr("Serve login con azienda attiva.");
      })
      .catch(() => setErr("Serve login con azienda attiva."));
  };
  useEffect(() => load(), []);

  const mostraAltri = async () => {
    setCaricandoAltri(true);
    try {
      const r = await fetch(`/api/v1/customers?page=${pagina + 1}&limit=${PAGE}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      if (!r.ok) throw new Error();
      const j = await r.json();
      const items = Array.isArray(j) ? j : (j?.items ?? []);
      if (items.length) {
        setList((prev) => [...prev, ...items]);
        setPagina((p) => p + 1);
        if (j?.totale != null) setTotale(j.totale);
      }
    } catch { /* rete: si riprova */ } finally {
      setCaricandoAltri(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch(`/api/v1/customers/${edit.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: edit.nome, telefono: edit.telefono, email: edit.email || null, note: edit.note || null }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? "Errore"); return; }
    setEdit(null); setErr(""); load(q);
  };

  const wa = (c: any, msg: string) => `https://wa.me/${c.telefono.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;

  return (
    <div className="grid gap-4">
      <div><p className="text-sm text-muted">Clienti</p><h1 className="text-2xl">Anagrafica dalle prenotazioni.</h1></div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); load(q); }}>
        <input className="card flex-1 p-2" placeholder="Cerca nome o telefono" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary" type="submit">Cerca</button>
      </form>
      {list.map((c: any) => (
        <div key={c.id} className="card p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><b>{c.nome}</b> <span className="text-muted">{c.telefono} {c.email ? `· ${c.email}` : ""} · {c._count.bookings} pren.</span></div>
            <div className="flex gap-3 text-sm font-bold">
              <a className="text-[#177469]" target="_blank" rel="noreferrer" href={wa(c, `Ciao ${c.nome}, ti scriviamo da NaBoat per la tua prenotazione.`)}>WhatsApp →</a>
              <button className="text-ocean" onClick={() => setEdit({ ...c })}>Modifica</button>
            </div>
          </div>
          {edit?.id === c.id && (
            <form className="mt-3 grid gap-2 md:grid-cols-4" onSubmit={save}>
              <input className="rounded-md border border-line p-2" value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} />
              <input className="rounded-md border border-line p-2" value={edit.telefono} onChange={(e) => setEdit({ ...edit, telefono: e.target.value })} />
              <input className="rounded-md border border-line p-2" placeholder="Email" value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              <input className="rounded-md border border-line p-2" placeholder="Note" value={edit.note ?? ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
              <button className="btn-primary" type="submit">Salva</button>
            </form>
          )}
        </div>
      ))}
      {list.length === 0 && <p className="text-sm text-muted">Nessun cliente: si creano automaticamente dalle prenotazioni.</p>}
      {list.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">{list.length < totale ? `mostrati ${list.length} di ${totale} clienti` : `${totale} clienti`}</p>
          {list.length < totale && (
            <button
              className="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-ocean hover:bg-foam disabled:opacity-60"
              onClick={mostraAltri}
              disabled={caricandoAltri}
            >
              {caricandoAltri ? "Carico…" : `Mostra altri (${totale - list.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
