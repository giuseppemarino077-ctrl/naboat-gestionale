"use client";
import { useState } from "react";

export default function AdminNuovaAziendaPage() {
  const [f, setF] = useState({ nome: "", tipoModulo: "noleggio", ownerNome: "", ownerEmail: "", ownerPassword: "" });
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const campo = "rounded-2xl border border-line p-3 text-sm";

  const crea = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setOkMsg("");
    const r = await fetch("/api/v1/admin/tenants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    setOkMsg(`Azienda creata con titolare ${f.ownerEmail}.`);
    setF({ nome: "", tipoModulo: "noleggio", ownerNome: "", ownerEmail: "", ownerPassword: "" });
  };

  return (
    <div className="mx-auto grid max-w-xl gap-4">
      <div>
        <p className="text-sm text-muted">NaBoat Admin</p>
        <h1 className="text-2xl">Crea un'azienda.</h1>
        <p className="mt-1 text-sm text-muted">Crea l'azienda e l'account titolare in un solo passaggio.</p>
      </div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      {okMsg && <p className="card p-3 text-sm font-semibold text-[#177469]">{okMsg}</p>}
      <form className="card grid gap-3 p-5" onSubmit={crea}>
        <input className={campo} placeholder="Nome azienda *" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required />
        <label className="grid gap-1 text-sm">Modulo
          <select className={campo} value={f.tipoModulo} onChange={(e) => setF({ ...f, tipoModulo: e.target.value })}>
            <option value="noleggio">Noleggio</option>
            <option value="ormeggio">Ormeggio</option>
            <option value="entrambi">Entrambi</option>
          </select>
        </label>
        <input className={campo} placeholder="Nome titolare *" value={f.ownerNome} onChange={(e) => setF({ ...f, ownerNome: e.target.value })} required />
        <input className={campo} type="email" placeholder="Email titolare *" value={f.ownerEmail} onChange={(e) => setF({ ...f, ownerEmail: e.target.value })} required />
        <input className={campo} type="text" placeholder="Password iniziale (min 10 caratteri) *" value={f.ownerPassword} onChange={(e) => setF({ ...f, ownerPassword: e.target.value })} required />
        <button className="btn-primary" type="submit">Crea azienda</button>
      </form>
    </div>
  );
}
