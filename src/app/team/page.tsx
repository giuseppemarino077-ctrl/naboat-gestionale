"use client";
import { useEffect, useState } from "react";

export default function TeamPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({ email: "", password: "", nome: "", role: "operatore" });
  const [azienda, setAzienda] = useState<{ nome: string; logoUrl: string | null; indirizzoPartenza: string | null; telefonoContatto: string | null } | null>(null);
  const [nomeAzienda, setNomeAzienda] = useState("");
  const [contatti, setContatti] = useState({ indirizzoPartenza: "", telefonoContatto: "" });
  const [skippers, setSkippers] = useState<any[]>([]);
  const [scelta, setScelta] = useState<Record<string, string>>({});

  const load = () => {
    fetch("/api/v1/users").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then(setUsers).catch(() => setErr("Riservato al proprietario (azienda attiva)."));
    fetch("/api/v1/skippers").then((r) => r.json()).then((j) => Array.isArray(j) && setSkippers(j)).catch(() => {});
    fetch("/api/v1/tenant").then((r) => r.json()).then((j) => {
      if (j?.nome) {
        setAzienda(j);
        setNomeAzienda(j.nome);
        setContatti({ indirizzoPartenza: j.indirizzoPartenza ?? "", telefonoContatto: j.telefonoContatto ?? "" });
      }
    }).catch(() => {});
  };
  useEffect(load, []);

  const api = async (url: string, method: string, body?: any) => {
    setMsg("");
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErr(j.error ?? "Errore");
    else { setErr(""); load(); }
  };

  const caricaLogo = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/v1/tenant/logo", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Caricamento logo non riuscito"); return; }
    setErr(""); setMsg("Logo aggiornato."); load();
  };

  return (
    <div className="grid gap-4">
      <div><p className="text-sm text-muted">Team</p><h1 className="text-2xl">Operatori interni.</h1>
        <a className="text-sm font-bold text-ocean" href="/registro">Vedi il registro delle modifiche →</a>
      </div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="card p-3 text-sm font-semibold text-[#177469]">{msg}</p>}

      {azienda && (
        <div className="card grid gap-3 p-5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg">Dati dell'azienda</h2>
            <a className="font-bold text-ocean" href="/impostazioni">Modifica il profilo pubblico →</a>
          </div>
          <p className="text-muted">Nome e logo compaiono nel menu del portale. Descrizione, contatti pubblici e visibilità si gestiscono dal profilo pubblico.</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1">Nome azienda
              <input className="rounded-md border border-line p-2" value={nomeAzienda} onChange={(e) => setNomeAzienda(e.target.value)} />
            </label>
            <label className="grid gap-1">Punto di partenza (compare nel contratto e nei promemoria)
              <input className="rounded-md border border-line p-2" value={contatti.indirizzoPartenza} onChange={(e) => setContatti({ ...contatti, indirizzoPartenza: e.target.value })} placeholder="Es. Porto di Sorrento, Molo B" />
            </label>
            <label className="grid gap-1">Telefono per i clienti
              <input className="rounded-md border border-line p-2" value={contatti.telefonoContatto} onChange={(e) => setContatti({ ...contatti, telefonoContatto: e.target.value })} placeholder="Es. 081 1234567" />
            </label>
            <button className="btn-primary" onClick={() => api("/api/v1/tenant", "PATCH", { nome: nomeAzienda, indirizzoPartenza: contatti.indirizzoPartenza, telefonoContatto: contatti.telefonoContatto })}>Salva dati</button>
            <label className="grid gap-1">Logo (jpeg/png/webp, max 5 MB)
              <input className="rounded-md border border-line p-2" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => e.target.files?.[0] && caricaLogo(e.target.files[0])} />
            </label>
            {azienda.logoUrl && (
              <span className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={azienda.logoUrl} alt="logo" className="h-10 rounded border border-line bg-white object-contain p-1" />
                <button className="font-bold text-coral" onClick={() => api("/api/v1/tenant", "PATCH", { logoUrl: null })}>Rimuovi</button>
              </span>
            )}
          </div>
        </div>
      )}

      <form className="card grid gap-2 p-4 md:grid-cols-5" onSubmit={(e) => { e.preventDefault(); api("/api/v1/users", "POST", f); setF({ email: "", password: "", nome: "", role: "operatore" }); }}>
        <input className="rounded-md border border-line p-2" placeholder="Email *" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        <input className="rounded-md border border-line p-2" placeholder="Password (min 10) *" type="password" minLength={10} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
        <input className="rounded-md border border-line p-2" placeholder="Nome *" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required />
        <select className="rounded-md border border-line p-2" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          <option value="operatore">Operatore</option>
          <option value="skipper">Skipper</option>
        </select>
        <button className="btn-primary" type="submit">＋ Invita</button>
      </form>
      {users.map((u: any) => {
        const collegato = skippers.find((s: any) => s.userId === u.id);
        return (
          <div key={u.id} className="card grid gap-2 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><b>{u.nome ?? u.email}</b> <span className="text-muted">{u.email} · {u.role}</span></span>
              <div className="flex gap-3 font-bold">
                <button className="text-ocean" onClick={() => { const r = prompt("Nuovo ruolo (operatore/skipper):", u.role); if (r) api(`/api/v1/users/${u.id}`, "PATCH", { role: r }); }}>Ruolo</button>
                <button className="text-coral" onClick={() => confirm("Rimuovere?") && api(`/api/v1/users/${u.id}`, "DELETE")}>Rimuovi</button>
              </div>
            </div>

            {u.role !== "owner" && (
              <label className="flex items-center gap-2 border-t border-line pt-2 text-xs">
                <input type="checkbox" checked={u.vedeImporti !== false} onChange={(e) => api(`/api/v1/users/${u.id}`, "PATCH", { vedeImporti: e.target.checked })} />
                <span>Vede gli importi (prezzi, incassi, conti)</span>
                <span className="text-muted">— togli la spunta per un addetto che non deve vedere cifre</span>
              </label>
            )}

            {u.role === "skipper" && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2 text-xs">
                <span className="text-muted">Scheda skipper collegata:</span>
                {collegato ? (
                  <>
                    <b>{collegato.nome}</b>
                    <span className="text-muted">(vede solo le sue uscite)</span>
                    <button className="font-bold text-coral" onClick={() => api(`/api/v1/skippers/${collegato.id}`, "PATCH", { userId: null })}>Scollega</button>
                  </>
                ) : (
                  <>
                    <span className="text-coral">nessuna</span>
                    <select className="rounded-md border border-line p-1" value={scelta[u.id] ?? ""} onChange={(e) => setScelta({ ...scelta, [u.id]: e.target.value })}>
                      <option value="">Scegli lo skipper…</option>
                      {skippers.filter((s: any) => !s.userId).map((s: any) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                    </select>
                    <button className="font-bold text-ocean" disabled={!scelta[u.id]} onClick={() => api(`/api/v1/skippers/${scelta[u.id]}`, "PATCH", { userId: u.id })}>Collega</button>
                    <span className="text-muted">Senza collegamento non vedrebbe nulla.</span>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
