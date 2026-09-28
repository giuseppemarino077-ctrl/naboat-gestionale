"use client";
import { useEffect, useRef, useState } from "react";

type Boat = { id: string; nome: string; tipo?: string; capienza: number; potenzaCv?: number; patenteRichiesta: boolean; stato: string; fotoCopertina?: string | null; fotoGallery: string[]; lat?: number | null; lon?: number | null };

export default function FlottaPage() {
  const [boats, setBoats] = useState<Boat[]>([]);
  const [skippers, setSkippers] = useState<any[]>([]);
  const [extras, setExtras] = useState<any[]>([]);
  const [tab, setTab] = useState<"barche" | "skipper" | "extra">("barche");
  const [err, setErr] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", tipo: "", capienza: 6, potenzaCv: 100, patenteRichiesta: false });
  const [foto, setFoto] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [extra, setExtra] = useState({ nome: "", prezzo: "" });
  const [skipper, setSkipper] = useState({ nome: "", telefono: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ nome: "", tipo: "", capienza: 1, potenzaCv: 0, patenteRichiesta: false });

  const load = () => {
    fetch("/api/v1/boats")
      .then((r) => r.json())
      .then((j) => { if (Array.isArray(j)) { setBoats(j); setErr(""); } else setErr("Serve login con azienda attiva."); })
      .catch(() => setErr("Serve login con azienda attiva."));
    fetch("/api/v1/skippers").then((r) => r.json()).then((j) => Array.isArray(j) && setSkippers(j)).catch(() => {});
    fetch("/api/v1/extras").then((r) => r.json()).then((j) => Array.isArray(j) && setExtras(j)).catch(() => {});
  };
  useEffect(load, []);

  const upload = async (boatId: string, file: File) => {
    setUploading(boatId); setErr("");
    const fd = new FormData();
    fd.append("file", file); fd.append("boatId", boatId);
    const r = await fetch("/api/v1/uploads", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setUploading(null);
    if (!r.ok) setErr(j.error ?? "Upload fallito");
    else load();
  };

  const api = async (url: string, method: string, body?: any) => {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErr(j.error ?? "Errore");
    else { setErr(""); load(); }
  };

  const creaBarca = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const r = await fetch("/api/v1/boats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, potenzaCv: Number(form.potenzaCv) || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    for (const f of foto) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("boatId", j.id);
      await fetch("/api/v1/uploads", { method: "POST", body: fd }).catch(() => {});
    }
    setForm({ nome: "", tipo: "", capienza: 6, potenzaCv: 100, patenteRichiesta: false });
    setFoto([]);
    if (fileInput.current) fileInput.current.value = "";
    load();
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between">
        <div><p className="text-sm text-muted">Flotta</p><h1 className="text-2xl">Ogni risorsa, con il suo stato.</h1></div>
      </div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      <div className="flex gap-2 text-sm">
        {(["barche", "skipper", "extra"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 font-bold ${tab === t ? "bg-deep text-white" : "bg-white text-muted border border-line"}`}>{t}</button>
        ))}
      </div>

      {tab === "barche" && (
        <>
          <form className="card grid gap-3 p-4 md:grid-cols-12 md:items-end" onSubmit={creaBarca}>
            <label className="grid gap-1 text-sm md:col-span-4">
              <span className="text-xs font-semibold text-muted">Nome imbarcazione *</span>
              <input className="rounded-md border border-line p-2" placeholder="es. Gozzo Sorrentino 7.5" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </label>
            <label className="grid gap-1 text-sm md:col-span-3">
              <span className="text-xs font-semibold text-muted">Tipo</span>
              <input className="rounded-md border border-line p-2" placeholder="es. gozzo, open, gommone" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">
              <span className="text-xs font-semibold text-muted">Capienza (persone)</span>
              <input className="rounded-md border border-line p-2" type="number" min={1} value={form.capienza} onChange={(e) => setForm({ ...form, capienza: Number(e.target.value) })} />
            </label>
            <label className="grid gap-1 text-sm md:col-span-3">
              <span className="text-xs font-semibold text-muted">Potenza motore (CV)</span>
              <input className="rounded-md border border-line p-2" type="number" min={0} value={form.potenzaCv} onChange={(e) => setForm({ ...form, potenzaCv: Number(e.target.value) })} />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm md:col-span-3">
              <input type="checkbox" checked={form.patenteRichiesta} onChange={(e) => setForm({ ...form, patenteRichiesta: e.target.checked })} />
              Richiesta la <b>patente nautica</b>
            </label>
            <label className="grid gap-1 text-sm md:col-span-6">
              <span className="text-xs font-semibold text-muted">Foto dell'imbarcazione (facoltative · jpeg/png/webp · max 5 MB)</span>
              <input ref={fileInput} className="rounded-md border border-line p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-foam file:px-3 file:py-1.5 file:font-bold file:text-ocean" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => setFoto(Array.from(e.target.files ?? []))} />
            </label>
            <div className="md:col-span-3">
              <button className="btn-primary w-full" type="submit">＋ Aggiungi imbarcazione</button>
            </div>
          </form>
          <div className="grid gap-3 md:grid-cols-3">
            {boats.map((b) => (
              <article key={b.id} className="card overflow-hidden">
                <div className="relative flex h-28 items-start justify-end bg-gradient-to-br from-foam to-[#e6f3f0] p-2">
                  {b.fotoCopertina && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.fotoCopertina} alt={b.nome} className="absolute inset-0 h-full w-full cursor-zoom-in object-cover" onClick={() => setLightbox(b.fotoCopertina!)} />
                  )}
                  <select className="relative rounded-full bg-white/90 px-2 py-1 text-xs font-bold text-ocean" value={b.stato} onChange={(e) => api(`/api/v1/boats/${b.id}`, "PATCH", { stato: e.target.value })}>
                    <option value="disponibile">Disponibile</option>
                    <option value="non_disponibile">Non disponibile</option>
                    <option value="manutenzione">Manutenzione</option>
                  </select>
                </div>
                <div className="p-4">
                  <p className="text-xs tracking-widest text-muted">{b.tipo ?? "BARCA"}{b.patenteRichiesta ? " · PATENTE" : ""}</p>
                  <h2 className="mb-3">{b.nome}</h2>
                  <dl className="grid grid-cols-2 text-sm">
                    <div><dt className="text-xs text-muted">Capienza</dt><dd className="font-bold">{b.capienza}</dd></div>
                    <div><dt className="text-xs text-muted">Potenza</dt><dd className="font-bold">{b.potenzaCv ? `${b.potenzaCv} CV` : "–"}</dd></div>
                  </dl>
                  <button
                    className="mt-2 text-xs font-bold text-ocean"
                    onClick={() => {
                      const lat = prompt("Latitudine (es. 40.8397)", b.lat?.toString() ?? "");
                      if (lat === null) return;
                      const lon = prompt("Longitudine (es. 14.2524)", b.lon?.toString() ?? "");
                      if (lon === null) return;
                      const nLat = lat.trim() === "" ? null : Number(lat.replace(",", "."));
                      const nLon = lon.trim() === "" ? null : Number(lon.replace(",", "."));
                      if ((nLat !== null && !Number.isFinite(nLat)) || (nLon !== null && !Number.isFinite(nLon))) { setErr("Coordinate non valide"); return; }
                      api(`/api/v1/boats/${b.id}`, "PATCH", { lat: nLat, lon: nLon });
                    }}
                  >
                    {b.lat && b.lon ? `Posizione: ${b.lat}, ${b.lon} — modifica` : "＋ Aggiungi posizione per il meteo"}
                  </button>
                  <div className="mt-3">
                    <p className="text-xs font-bold text-muted">FOTO DELL'IMBARCAMENTO ({b.fotoGallery?.length ?? 0})</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {(b.fotoGallery ?? []).map((u) => (
                        <span key={u} className={`relative inline-block ${u === b.fotoCopertina ? "ring-2 ring-ocean" : ""}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={u} alt="" className="h-12 w-16 cursor-zoom-in rounded object-cover" onClick={() => setLightbox(u)} />
                          <span className="absolute bottom-0 left-0 flex gap-1 bg-white/90 p-0.5 text-[10px] font-bold">
                            {u !== b.fotoCopertina && <button className="text-ocean" title="Copertina" onClick={() => api(`/api/v1/boats/${b.id}`, "PATCH", { fotoCopertina: u })}>★</button>}
                            <button className="text-coral" title="Elimina" onClick={() => confirm("Eliminare foto?") && api(`/api/v1/boats/${b.id}`, "PATCH", { rimuoviFoto: u })}>✕</button>
                          </span>
                        </span>
                      ))}
                      <label title="Aggiungi una foto dell'imbarcazione" className="grid h-12 w-16 cursor-pointer place-items-center rounded border border-dashed border-line text-lg text-muted">
                        {uploading === b.id ? "…" : "＋"}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(b.id, f); e.target.value = ""; }} />
                      </label>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-3 text-xs">
                    <button className="font-bold text-ocean" onClick={() => { setEditId(editId === b.id ? null : b.id); setEdit({ nome: b.nome, tipo: b.tipo ?? "", capienza: b.capienza, potenzaCv: b.potenzaCv ?? 0, patenteRichiesta: b.patenteRichiesta }); }}>{editId === b.id ? "Chiudi" : "✎ Modifica"}</button>
                    <button className="font-bold text-ocean" onClick={() => api(`/api/v1/boats/${b.id}/duplicate`, "POST")}>Duplica</button>
                    <button className="font-bold text-coral" onClick={() => confirm("Eliminare?") && api(`/api/v1/boats/${b.id}`, "DELETE")}>Elimina</button>
                  </div>

                  {editId === b.id && (
                    <div className="mt-3 grid gap-2 rounded-2xl border border-line bg-[#faf6f2] p-3 text-sm">
                      <label className="grid gap-1">Nome<input className="rounded-2xl border border-line p-2.5" value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="grid gap-1">Tipo<input className="rounded-2xl border border-line p-2.5" value={edit.tipo} onChange={(e) => setEdit({ ...edit, tipo: e.target.value })} /></label>
                        <label className="grid gap-1">Capienza<input className="rounded-2xl border border-line p-2.5" type="number" min={1} value={edit.capienza} onChange={(e) => setEdit({ ...edit, capienza: Number(e.target.value) })} /></label>
                        <label className="grid gap-1">Potenza (CV)<input className="rounded-2xl border border-line p-2.5" type="number" min={0} value={edit.potenzaCv} onChange={(e) => setEdit({ ...edit, potenzaCv: Number(e.target.value) })} /></label>
                        <label className="flex items-end gap-2 pb-2"><input type="checkbox" checked={edit.patenteRichiesta} onChange={(e) => setEdit({ ...edit, patenteRichiesta: e.target.checked })} /> Patente richiesta</label>
                      </div>
                      <div className="flex gap-2">
                        <button className="btn-primary flex-1" onClick={async () => { await api(`/api/v1/boats/${b.id}`, "PATCH", { nome: edit.nome, tipo: edit.tipo || null, capienza: edit.capienza, potenzaCv: edit.potenzaCv, patenteRichiesta: edit.patenteRichiesta }); setEditId(null); }}>Salva modifiche</button>
                        <button className="btn-soft" onClick={() => setEditId(null)}>Annulla</button>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
          {boats.length === 0 && <p className="text-sm text-muted">Nessuna barca: aggiungi la prima dal modulo sopra.</p>}
        </>
      )}
      {lightbox && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded" />
        </div>
      )}

      {tab === "skipper" && (
        <div className="grid gap-3">
          <form className="card flex gap-2 p-4" onSubmit={(e) => { e.preventDefault(); api("/api/v1/skippers", "POST", skipper); setSkipper({ nome: "", telefono: "" }); }}>
            <input className="rounded-md border border-line p-2" placeholder="Nome *" value={skipper.nome} onChange={(e) => setSkipper({ ...skipper, nome: e.target.value })} required />
            <input className="rounded-md border border-line p-2" placeholder="Telefono" value={skipper.telefono} onChange={(e) => setSkipper({ ...skipper, telefono: e.target.value })} />
            <button className="btn-primary" type="submit">＋</button>
          </form>
          {skippers.map((s: any) => (
            <div key={s.id} className="card flex items-center justify-between p-3 text-sm">
              <span><b>{s.nome}</b> <span className="text-muted">{s.telefono ?? ""}</span></span>
              <button className="font-bold text-coral" onClick={() => api(`/api/v1/skippers/${s.id}`, "DELETE")}>Rimuovi</button>
            </div>
          ))}
        </div>
      )}

      {tab === "extra" && (
        <div className="grid gap-3">
          <form className="card flex gap-2 p-4" onSubmit={(e) => { e.preventDefault(); api("/api/v1/extras", "POST", { nome: extra.nome, prezzo: extra.prezzo ? Number(extra.prezzo) : undefined }); setExtra({ nome: "", prezzo: "" }); }}>
            <input className="rounded-md border border-line p-2" placeholder="Nome *" value={extra.nome} onChange={(e) => setExtra({ ...extra, nome: e.target.value })} required />
            <input className="rounded-md border border-line p-2" placeholder="Prezzo €" type="number" min={0} value={extra.prezzo} onChange={(e) => setExtra({ ...extra, prezzo: e.target.value })} />
            <button className="btn-primary" type="submit">＋</button>
          </form>
          {extras.map((x: any) => (
            <div key={x.id} className="card flex items-center justify-between p-3 text-sm">
              <span><b>{x.nome}</b> <span className="text-muted">{x.prezzo != null ? `€ ${x.prezzo}` : ""}</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
