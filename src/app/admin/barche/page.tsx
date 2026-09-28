"use client";
import { useEffect, useState } from "react";

type Barca = { id: string; nome: string; tipo: string | null; pubblicata: boolean; inPausa: boolean; tenant: { nome: string; status: string } | null };

export default function AdminBarchePage() {
  const [barche, setBarche] = useState<Barca[]>([]);
  const [stato, setStato] = useState("tutte");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  const carica = () => {
    fetch(`/api/v1/admin/barche?stato=${stato}&q=${encodeURIComponent(q)}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (Array.isArray(j)) { setBarche(j); setErr(""); } else setErr("Riservato a NaBoat (superadmin)."); })
      .catch(() => setErr("Riservato a NaBoat (superadmin)."));
  };
  useEffect(carica, [stato]);

  const azione = async (boatId: string, a: "nascondi" | "mostra") => {
    await fetch("/api/v1/admin/barche", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boatId, azione: a }) });
    carica();
  };

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm text-muted">NaBoat Admin</p>
        <h1 className="text-2xl">Barche della piattaforma.</h1>
        <p className="mt-1 text-sm text-muted">Puoi nascondere una barca non conforme senza cancellarne i dati.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {["tutte", "pubblicate", "nascoste"].map((s) => (
          <button key={s} onClick={() => setStato(s)} className={"rounded-full px-4 py-1.5 font-bold capitalize " + (stato === s ? "bg-deep text-white" : "border border-line bg-white text-muted")}>{s}</button>
        ))}
        <input className="rounded-full border border-line bg-white px-4 py-1.5" placeholder="Cerca per nome…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && carica()} />
      </div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted"><tr><th className="p-3">Barca</th><th className="p-3">Azienda</th><th className="p-3">Stato</th><th className="p-3"></th></tr></thead>
          <tbody>
            {barche.map((b) => (
              <tr key={b.id} className="border-t border-line">
                <td className="p-3 font-semibold">{b.nome} <span className="text-muted">{b.tipo ?? ""}</span></td>
                <td className="p-3 text-muted">{b.tenant?.nome ?? "—"}</td>
                <td className="p-3">{b.pubblicata && !b.inPausa ? <span className="badge-ready">pubblicata</span> : <span className="badge-block">nascosta</span>}</td>
                <td className="p-3">
                  {b.pubblicata && !b.inPausa
                    ? <button className="font-bold text-coral" onClick={() => azione(b.id, "nascondi")}>Nascondi</button>
                    : <button className="font-bold text-ocean" onClick={() => azione(b.id, "mostra")}>Mostra</button>}
                </td>
              </tr>
            ))}
            {barche.length === 0 && !err && <tr><td className="p-3 text-muted" colSpan={4}>Nessuna barca.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
