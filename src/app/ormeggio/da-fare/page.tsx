"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAggiornamenti, segnalaCambiamento } from "@/lib/aggiorna";

export default function DaFarePage() {
  const [attivita, setAttivita] = useState<any[]>([]);
  const [err, setErr] = useState("");

  const carica = () => fetch("/api/v1/ormeggio/attivita?daFare=1").then((r) => r.json()).then((j) => { if (Array.isArray(j)) setAttivita(j); else setErr(j.error ?? "Errore"); }).catch(() => setErr("Errore"));
  useEffect(() => { carica(); }, []);
  // La griglia e le altre postazioni vedono lo stato aggiornato dei lavori.
  useAggiornamenti(carica, ["ormeggio"]);

  const cambia = async (a: any, stato: string) => {
    await fetch(`/api/v1/ormeggio/attivita/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stato }) });
    carica();
    segnalaCambiamento("ormeggio");
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-sm text-muted">Ormeggio</p><h1 className="text-2xl">Da fare.</h1></div>
        <Link className="rounded-[7px] border border-line px-3 py-2 text-sm font-bold text-ocean" href="/ormeggio">← Griglia</Link>
      </div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted"><tr className="text-left"><th className="p-2">Barca</th><th className="p-2">Posto</th><th className="p-2">Lavoro</th><th className="p-2">Data prevista</th><th className="p-2">Stato</th><th className="p-2">Azioni</th></tr></thead>
          <tbody>
            {attivita.map((a) => (
              <tr key={a.id} className="border-t border-line">
                <td className="p-2 font-semibold">{a.permanenza?.boat?.nome}</td>
                <td className="p-2">{a.permanenza?.posto?.codice}</td>
                <td className="p-2">{a.tipo}</td>
                <td className="p-2">{a.dataPrevista ? new Date(a.dataPrevista).toLocaleDateString("it-IT") : "—"}</td>
                <td className="p-2"><span className={a.stato === "in_corso" ? "badge-pending" : "badge-block"}>{a.stato.replace("_", " ")}</span></td>
                <td className="p-2">
                  <div className="flex gap-2 font-bold">
                    {a.stato === "da_fare" && <button className="text-ocean" onClick={() => cambia(a, "in_corso")}>Avvia</button>}
                    <button className="text-[#177469]" onClick={() => cambia(a, "completato")}>Completa</button>
                    <Link className="text-ocean" href={`/ormeggio/permanenza/${a.permanenzaId}`}>Scheda →</Link>
                  </div>
                </td>
              </tr>
            ))}
            {attivita.length === 0 && <tr><td className="p-3 text-muted" colSpan={6}>Nessun lavoro in sospeso.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
