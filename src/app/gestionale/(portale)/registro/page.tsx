"use client";
import { useEffect, useState } from "react";

type Voce = {
  id: string; azione: string; entita: string | null; entitaId: string | null;
  dettagli: { nota?: string; cambi?: Record<string, { prima: unknown; dopo: unknown }>; prima?: unknown; dopo?: unknown } | null;
  createdAt: string; attore: string | null;
};

const valore = (v: unknown) => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString("it-IT");
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
};

export default function RegistroPage() {
  const [voci, setVoci] = useState<Voce[]>([]);
  const [azione, setAzione] = useState("");
  const [err, setErr] = useState("");

  const load = () => {
    fetch(`/api/v1/audit?limite=150${azione ? `&azione=${encodeURIComponent(azione)}` : ""}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setVoci(j); })
      .catch((e) => setErr(e.message));
  };
  useEffect(load, [azione]);

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm text-muted">Registro</p>
        <h1 className="text-2xl">Chi ha cambiato cosa.</h1>
      </div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}

      <div className="card flex flex-wrap items-end gap-3 p-4 text-sm">
        <label className="grid gap-1">Filtra per tipo di operazione
          <input className="rounded-md border border-line p-2" value={azione} onChange={(e) => setAzione(e.target.value)} placeholder="es. booking, pagamento, spesa…" />
        </label>
        <button className="rounded-md border border-line px-3 py-2 font-bold" onClick={load}>Aggiorna</button>
        <span className="text-xs text-muted">Sono mostrate le ultime 150 voci. Le modifiche ai valori si vedono alla voce «cambi».</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted"><tr className="text-left">
            <th className="p-2">Quando</th><th className="p-2">Operazione</th><th className="p-2">Chi</th><th className="p-2">Dettaglio</th>
          </tr></thead>
          <tbody>
            {voci.map((v) => (
              <tr key={v.id} className="border-t border-line align-top">
                <td className="p-2 whitespace-nowrap">{new Date(v.createdAt).toLocaleString("it-IT")}</td>
                <td className="p-2"><b>{v.azione}</b><span className="block text-xs text-muted">{v.entita ?? ""}</span></td>
                <td className="p-2">{v.attore ?? "—"}</td>
                <td className="p-2">
                  {v.dettagli?.nota && <span className="block">{v.dettagli.nota}</span>}
                  {v.dettagli?.cambi && (
                    <ul className="list-disc pl-4 text-xs">
                      {Object.entries(v.dettagli.cambi).map(([campo, c]) => (
                        <li key={campo}><b>{campo}</b>: {valore(c.prima)} → {valore(c.dopo)}</li>
                      ))}
                    </ul>
                  )}
                  {!v.dettagli?.cambi && !v.dettagli?.nota && v.dettagli?.dopo ? (
                    <span className="text-xs text-muted">{Object.entries(v.dettagli.dopo as Record<string, unknown>).slice(0, 4).map(([k, val]) => `${k}: ${valore(val)}`).join(" · ")}</span>
                  ) : null}
                </td>
              </tr>
            ))}
            {!voci.length && <tr><td className="p-3 text-muted" colSpan={4}>Nessuna voce nel registro.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
