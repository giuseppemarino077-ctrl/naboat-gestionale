"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function MovimentiPage() {
  const [movimenti, setMovimenti] = useState<any[]>([]);
  const [data, setData] = useState("");
  const [err, setErr] = useState("");

  const carica = () => fetch(`/api/v1/ormeggio/movimenti${data ? `?data=${data}` : ""}`).then((r) => r.json()).then((j) => { if (Array.isArray(j)) setMovimenti(j); else setErr(j.error ?? "Errore"); }).catch(() => setErr("Errore"));
  useEffect(() => { carica(); }, [data]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-sm text-muted">Ormeggio</p><h1 className="text-2xl">Movimenti.</h1><p className="text-sm text-muted">Uscite programmate ed effettive, rientri e trasferimenti.</p></div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm"><span className="text-xs font-semibold text-muted">Filtra per giorno</span><input type="date" className="rounded-md border border-line p-2" value={data} onChange={(e) => setData(e.target.value)} /></label>
          <Link className="rounded-[7px] border border-line px-3 py-2 text-sm font-bold text-ocean" href="/gestionale/ormeggio">← Griglia</Link>
        </div>
      </div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted"><tr className="text-left"><th className="p-2">Tipo</th><th className="p-2">Barca</th><th className="p-2">Posto</th><th className="p-2">Previsto</th><th className="p-2">Effettivo</th><th className="p-2">Note</th><th className="p-2"></th></tr></thead>
          <tbody>
            {movimenti.map((m) => (
              <tr key={m.id} className="border-t border-line">
                <td className="p-2 font-semibold">{m.tipo.replace("_", " ")}</td>
                <td className="p-2">{m.permanenza?.boat?.nome}</td>
                <td className="p-2">{m.permanenza?.posto?.codice}</td>
                <td className="p-2">{m.previstoAt ? new Date(m.previstoAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                <td className="p-2">{m.effettivoAt ? new Date(m.effettivoAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                <td className="p-2 text-muted">{m.note ?? ""}</td>
                <td className="p-2"><Link className="font-bold text-ocean" href={`/gestionale/ormeggio/permanenza/${m.permanenzaId}`}>Scheda →</Link></td>
              </tr>
            ))}
            {movimenti.length === 0 && <tr><td className="p-3 text-muted" colSpan={7}>Nessun movimento.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
