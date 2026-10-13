"use client";

import { useMemo, useState } from "react";
import { aggiungiGiorni, lunediDi } from "@/modules/piattaforma/date";
import { data, euro, numero } from "@/modules/ormeggio/statistiche/presentazione";
import type { DashboardStatistiche, SelezioneStatistica } from "@/modules/ormeggio/statistiche/presentazione";

export function GraficoStatistiche({ serie, occupazione = false, onDettaglio }: { serie: DashboardStatistiche["serie"]; occupazione?: boolean; onDettaglio: (selezione: SelezioneStatistica) => void }) {
  const [scala, setScala] = useState<"auto" | "giorno" | "settimana" | "mese">("auto");
  const [selezionato, setSelezionato] = useState<string | null>(null);
  const gruppo = scala === "auto" ? serie.length > 100 ? "mese" : serie.length > 40 ? "settimana" : "giorno" : scala;
  const punti = useMemo(() => {
    const map = new Map<string, DashboardStatistiche["serie"][number] & { dal: string; al: string }>();
    for (const s of serie) {
      const key = gruppo === "mese" ? s.giorno.slice(0, 7) + "-01" : gruppo === "settimana" ? lunediDi(s.giorno) : s.giorno;
      const prev = map.get(key) ?? { giorno: key, dal: s.giorno, al: s.giorno, ricevutiCent: 0, rimborsatiCent: 0, nettiCent: 0, valoreCent: 0, programmatoCent: 0, disponibili: 0, riservati: 0, occupazione: null };
      for (const field of ["ricevutiCent", "rimborsatiCent", "nettiCent", "disponibili", "riservati"] as const) prev[field] += s[field];
      prev.al = s.giorno;
      map.set(key, prev);
    }
    return [...map.values()].map((s) => ({ ...s, occupazione: s.disponibili ? s.riservati / s.disponibili * 100 : null }));
  }, [serie, gruppo]);
  const max = occupazione ? Math.max(100, ...punti.map((s) => s.occupazione ?? 0)) : Math.max(1, ...punti.map((s) => s.ricevutiCent));
  const min = occupazione ? 0 : -Math.max(0, ...punti.map((s) => s.rimborsatiCent));
  const w = 360, h = 210, left = 54, right = 10, top = 15, bottom = 30;
  const y = (v: number) => top + (max - v) / (max - min) * (h - top - bottom);
  const step = (w - left - right) / Math.max(1, punti.length);
  const active = punti.find((s) => s.giorno === selezionato);
  const indice = active ? punti.indexOf(active) : -1;
  const etichetta = (s: typeof punti[number]) => s.dal === s.al ? data(s.dal) : `${data(s.dal)} – ${data(s.al)}`;
  const apri = (s: typeof punti[number]) => { setSelezionato(s.giorno); onDettaglio({ tipo: occupazione ? "occupazione" : "incassi", dal: s.dal, al: s.al }); };
  const giorni = active ? Math.round((+new Date(aggiungiGiorni(active.al, 1)) - +new Date(active.dal)) / 86400000) : 1;
  return <section className="card flex h-full min-w-0 flex-col p-4 sm:p-5">
    <div className="min-h-32">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg">{occupazione ? "Occupazione commerciale" : "Andamento economico"}</h2>
      <label className="flex items-center gap-2 whitespace-nowrap text-xs text-muted">Mostra per
        <select className="campo max-w-36 py-1 text-xs" aria-label={occupazione ? "Intervallo occupazione" : "Intervallo incassi"} value={scala} onChange={(e) => { setScala(e.target.value as typeof scala); setSelezionato(null); }}>
          <option value="auto">Automatico</option><option value="giorno">Giorno</option><option value="settimana">Settimana</option><option value="mese">Mese</option>
        </select>
      </label>
    </div>
    <p className="mb-3 mt-1 text-xs text-muted">{occupazione ? "Percentuale di posti riservati, anche quando la barca è in mare." : "Pagamenti ricevuti e rimborsi nelle date selezionate."}</p>
    </div>
    <svg viewBox={`0 0 ${w} ${h}`} className="h-48 w-full shrink-0" role="img" aria-label={occupazione ? "Occupazione per intervallo" : "Incassi ricevuti e rimborsi per intervallo"}>
      {[0, 0.5, 1].map((f) => { const v = min + (max - min) * f; return <g key={f}><line x1={left} x2={w - right} y1={y(v)} y2={y(v)} stroke="#dbe7e9" /><text x={left - 7} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#5e747c">{occupazione ? `${numero(v, 0)}%` : `${numero(v / 100, 0)} €`}</text></g>; })}
      {active && <rect x={left + indice * step} y={top} width={step} height={h - top - bottom} fill="#087f8c" opacity=".09" />}
      {!occupazione && punti.map((s, i) => <g key={s.giorno}><rect x={left + i * step + step * .15} y={y(s.ricevutiCent)} width={Math.max(.3, step * .7)} height={Math.max(0, y(0) - y(s.ricevutiCent))} fill={selezionato === s.giorno ? "#052f3f" : "#23a6a6"} rx="2" /><rect x={left + i * step + step * .15} y={y(0)} width={Math.max(.3, step * .7)} height={Math.max(0, y(-s.rimborsatiCent) - y(0))} fill="#ed836b" rx="2" /></g>)}
      {occupazione && punti.map((s, i) => { const prev = punti[i - 1]; return <g key={s.giorno}>{s.occupazione != null && prev?.occupazione != null && <line x1={left + (i - .5) * step} x2={left + (i + .5) * step} y1={y(prev.occupazione)} y2={y(s.occupazione)} stroke="#087f8c" strokeWidth="3" />}{s.occupazione != null && <circle cx={left + (i + .5) * step} cy={y(s.occupazione)} r={selezionato === s.giorno ? 6 : 3} fill="#087f8c" />}</g>; })}
      {active && <line x1={left + (indice + .5) * step} x2={left + (indice + .5) * step} y1={top} y2={h - bottom} stroke="#087f8c" strokeDasharray="4 4" />}
      {punti.map((s, i) => <rect key={s.giorno} x={left + i * step} y={top} width={step} height={h - top - bottom} fill="transparent" className="cursor-pointer focus:outline-ocean" tabIndex={0} role="button" aria-label={`${etichetta(s)}: ${occupazione ? numero(s.occupazione) + "%" : euro(s.nettiCent)}. Apri dettaglio`} onFocus={() => setSelezionato(s.giorno)} onMouseEnter={() => setSelezionato(s.giorno)} onClick={() => apri(s)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); apri(s); } if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const next = e.key === "ArrowRight" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling; if (next?.getAttribute("role") === "button") (next as SVGElement).focus(); } }}><title>{etichetta(s)} · {occupazione ? `${numero(s.occupazione)}%` : `Ricevuti ${euro(s.ricevutiCent)} · Rimborsi ${euro(s.rimborsatiCent)} · Netto ${euro(s.nettiCent)}`}</title></rect>)}
      {punti.filter((_, i) => i === 0 || i === punti.length - 1 || i === Math.floor(punti.length / 2)).map((s) => <text key={s.giorno} x={left + (punti.indexOf(s) + .5) * step} y={h - 8} textAnchor="middle" fontSize="10" fill="#5e747c">{data(s.dal).replace(/ \d{4}$/, "")}</text>)}
    </svg>
    <div className="mt-1 min-h-24 rounded-xl bg-foam/70 p-3 text-sm" aria-live="polite">
      {active ? <><div className="flex flex-wrap items-center justify-between gap-2"><b>{etichetta(active)}</b><button className="font-semibold text-ocean underline underline-offset-4" onClick={() => apri(active)}>Apri dettaglio →</button></div><p className="mt-2 text-muted">{occupazione ? `${numero(active.occupazione)}% · in media ${numero(active.riservati / giorni)} posti riservati su ${numero(active.disponibili / giorni)} disponibili` : `Ricevuti ${euro(active.ricevutiCent)} · Rimborsi ${euro(active.rimborsatiCent)} · Netto ${euro(active.nettiCent)}`}</p></> : <p className="text-muted">Passa sul grafico per leggere i valori. Clicca o tocca un punto per aprirne il dettaglio.</p>}
    </div>
    <p className="mt-3 min-h-4 text-xs">{occupazione ? <span className="text-ocean">● Posti riservati</span> : <><span className="text-ocean">● Ricevuti</span><span className="ml-4 text-coral">● Rimborsi</span></>}</p>
  </section>;
}
