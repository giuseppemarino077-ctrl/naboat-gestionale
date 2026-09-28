"use client";
import { useEffect, useState } from "react";

type Riga = { id: string; nome: string; pianoTipo: string; pianoScadenzaAt: string | null; _count: { boats: number } };

export default function AdminPianiPage() {
  const [righe, setRighe] = useState<Riga[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const carica = () => {
    fetch("/api/v1/admin/piani")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (Array.isArray(j)) { setRighe(j); setErr(""); } else setErr("Riservato a NaBoat (superadmin)."); })
      .catch(() => setErr("Riservato a NaBoat (superadmin)."));
  };
  useEffect(carica, []);

  const imposta = async (tenantId: string, piano: "free" | "pro", scadenza: string | null) => {
    await fetch("/api/v1/admin/piani", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId, piano, scadenza }) });
    carica();
  };
  const applicaScadenze = async () => {
    const r = await fetch("/api/v1/admin/piani", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    setMsg(`Scadenze applicate: ${j.messeInPausa} barche messe in pausa su ${j.aziende} aziende.`);
    carica();
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-muted">NaBoat Admin</p>
          <h1 className="text-2xl">Piani Free e Pro.</h1>
          <p className="mt-1 text-sm text-muted">Alla scadenza, le barche eccedenti vengono messe in pausa senza cancellare nulla (mantenute le più vecchie).</p>
        </div>
        <button className="btn-soft" onClick={applicaScadenze}>Applica scadenze ora</button>
      </div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="card p-3 text-sm font-semibold text-[#177469]">{msg}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted"><tr><th className="p-3">Azienda</th><th className="p-3">Barche</th><th className="p-3">Piano</th><th className="p-3">Scadenza</th><th className="p-3"></th></tr></thead>
          <tbody>
            {righe.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="p-3 font-semibold">{r.nome}</td>
                <td className="p-3">{r._count.boats}</td>
                <td className="p-3">
                  <select className="rounded-full border border-line px-3 py-1.5" value={r.pianoTipo} onChange={(e) => imposta(r.id, e.target.value as "free" | "pro", r.pianoScadenzaAt ? r.pianoScadenzaAt.slice(0, 10) : null)}>
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                  </select>
                </td>
                <td className="p-3">
                  <input type="date" className="rounded-full border border-line px-3 py-1.5" value={r.pianoScadenzaAt ? r.pianoScadenzaAt.slice(0, 10) : ""} onChange={(e) => imposta(r.id, r.pianoTipo as "free" | "pro", e.target.value || null)} />
                </td>
                <td className="p-3">{r.pianoTipo === "pro" ? <span className="badge-ready">Pro</span> : <span className="badge-block">Free</span>}</td>
              </tr>
            ))}
            {righe.length === 0 && !err && <tr><td className="p-3 text-muted" colSpan={5}>Nessuna azienda attiva.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
