"use client";
import { useEffect, useState } from "react";

export default function ClientiPage() {
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<any>(null);

  const load = (query = "") => {
    fetch(`/api/v1/customers${query ? `?q=${encodeURIComponent(query)}` : ""}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (Array.isArray(j)) { setList(j); setErr(""); } else setErr("Serve login con azienda attiva."); })
      .catch(() => setErr("Serve login con azienda attiva."));
  };
  useEffect(() => load(), []);

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
    </div>
  );
}
