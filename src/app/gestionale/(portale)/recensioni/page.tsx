"use client";
import { useEffect, useState } from "react";

type Recensione = {
  id: string;
  voto: number;
  commento: string | null;
  risposta: string | null;
  stato: string;
  createdAt: string;
  booking: { startAt: string; clienteNome: string | null; boat: { nome: string } | null } | null;
};
type Sintesi = { media: number; totale: number; senzaRisposta: number; distribuzione: { voto: number; n: number }[] };

export default function RecensioniPage() {
  const [recensioni, setRecensioni] = useState<Recensione[]>([]);
  const [sintesi, setSintesi] = useState<Sintesi | null>(null);
  const [err, setErr] = useState("");
  const [risposte, setRisposte] = useState<Record<string, string>>({});

  const carica = () => {
    fetch("/api/v1/recensioni")
      .then((r) => r.json())
      .then((j) => { if (Array.isArray(j.recensioni)) { setRecensioni(j.recensioni); setSintesi(j.sintesi); } else setErr(j.error ?? "Errore"); })
      .catch(() => setErr("Errore di rete"));
  };
  useEffect(carica, []);

  const rispondi = async (id: string) => {
    const testo = (risposte[id] ?? "").trim();
    if (!testo) return;
    const r = await fetch("/api/v1/recensioni", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, risposta: testo }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? "Errore"); return; }
    setRisposte((x) => ({ ...x, [id]: "" }));
    carica();
  };

  const stelle = (n: number) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);

  return (
    <div className="grid gap-5">
      <div>
        <p className="text-sm text-muted">Recensioni</p>
        <h1 className="text-2xl">Cosa dicono i clienti.</h1>
        <p className="mt-1 text-sm text-muted">Solo chi ha concluso un'uscita può recensire. Puoi rispondere pubblicamente.</p>
      </div>

      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}

      {sintesi && (
        <div className="grid gap-3 md:grid-cols-[220px_1fr]">
          <div className="card p-4 text-center">
            <p className="font-display text-4xl font-extrabold text-deep">{sintesi.media.toFixed(1)}</p>
            <p className="text-xs text-muted">{sintesi.totale} recensioni · {sintesi.senzaRisposta} senza risposta</p>
          </div>
          <div className="card grid gap-1 p-4">
            {sintesi.distribuzione.slice().reverse().map((d) => (
              <div key={d.voto} className="flex items-center gap-2 text-xs">
                <span className="w-8 text-muted">{d.voto}★</span>
                <div className="h-2 flex-1 rounded-full bg-[#e8eeed]">
                  <div className="h-2 rounded-full bg-ocean" style={{ width: `${sintesi.totale ? (d.n / sintesi.totale) * 100 : 0}%` }} />
                </div>
                <span className="w-6 text-right text-muted">{d.n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {recensioni.map((r) => (
          <div key={r.id} className={"card p-4 text-sm " + (r.stato === "nascosta" ? "opacity-60" : "")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-gold">{stelle(r.voto)}</span>
              <span className="text-xs text-muted">
                {r.booking?.boat?.nome ?? "Barca"} · {r.booking?.startAt ? new Date(r.booking.startAt).toLocaleDateString("it-IT") : ""}
                {r.stato === "nascosta" ? " · nascosta da NaBoat" : ""}
              </span>
            </div>
            {r.commento && <p className="mt-2 whitespace-pre-line">{r.commento}</p>}
            {r.risposta ? (
              <div className="mt-3 rounded-2xl bg-[#f7faf9] p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-ocean">La tua risposta</p>
                <p className="mt-1 whitespace-pre-line">{r.risposta}</p>
              </div>
            ) : r.stato === "pubblicata" ? (
              <div className="mt-3 flex gap-2">
                <input className="flex-1 rounded-2xl border border-line p-2.5" placeholder="Rispondi pubblicamente…" value={risposte[r.id] ?? ""} onChange={(e) => setRisposte((x) => ({ ...x, [r.id]: e.target.value }))} />
                <button className="btn-primary" onClick={() => rispondi(r.id)}>Rispondi</button>
              </div>
            ) : null}
          </div>
        ))}
        {recensioni.length === 0 && !err && <p className="text-sm text-muted">Nessuna recensione ancora.</p>}
      </div>
    </div>
  );
}
