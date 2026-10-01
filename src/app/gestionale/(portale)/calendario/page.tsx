"use client";
import { useCallback, useEffect, useState } from "react";
import { aggiungiGiorni, oggi as oggiKey } from "@/lib/calendario";
import PlanningCalendario from "@/components/calendario/PlanningCalendario";

const PASSO = 20;

function dataValida(s: string | null): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : s;
}

function leggiStart(): string {
  if (typeof window === "undefined") return oggiKey();
  return dataValida(new URLSearchParams(window.location.search).get("start")) ?? oggiKey();
}

export default function CalendarioPage() {
  const [start, setStart] = useState<string>(() => leggiStart());

  const vai = useCallback((g: string) => {
    const valido = dataValida(g) ?? oggiKey();
    setStart(valido);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("start", valido);
      window.history.pushState({ start: valido }, "", url.toString());
    }
  }, []);

  // Indietro/avanti del browser restano coerenti con la finestra mostrata.
  useEffect(() => {
    const onPop = () => setStart(leggiStart());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const oggi = oggiKey();

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="hidden sm:block">
          <p className="text-xs font-bold uppercase tracking-widest text-ocean">Planning operativo</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">Calendario flotta</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            Barche in verticale, 45 giorni in orizzontale. Apri ogni casella per vedere prenotazioni, indisponibilità e azioni disponibili.
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 sm:hidden">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-ocean">Planning</p>
            <h1 className="font-display text-lg font-semibold text-ink">Calendario flotta</h1>
          </div>
          <div className="flex gap-1">
            <button type="button" aria-label="20 giorni indietro" onClick={() => vai(aggiungiGiorni(start, -PASSO))} className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-sm font-bold">←</button>
            <button type="button" onClick={() => vai(oggi)} className="inline-flex h-9 items-center rounded-lg bg-foam px-2.5 text-xs font-semibold text-ocean">Oggi</button>
            <button type="button" aria-label="20 giorni avanti" onClick={() => vai(aggiungiGiorni(start, PASSO))} className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-sm font-bold">→</button>
          </div>
        </div>

        <div className="hidden flex-wrap gap-2 sm:flex">
          <button type="button" onClick={() => vai(aggiungiGiorni(start, -PASSO))} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-white px-4 text-sm font-semibold hover:bg-foam">← 20 giorni</button>
          <button type="button" onClick={() => vai(oggi)} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-foam px-4 text-sm font-semibold text-ocean">Oggi</button>
          <button type="button" onClick={() => vai(aggiungiGiorni(start, PASSO))} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-white px-4 text-sm font-semibold hover:bg-foam">+ 20 giorni →</button>
        </div>
      </div>

      <PlanningCalendario start={start} onVai={vai} />
    </div>
  );
}
