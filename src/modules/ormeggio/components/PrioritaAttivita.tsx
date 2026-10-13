"use client";
import { useId } from "react";

export function StellePriorita({ valore }: { valore: number }) {
  return <span role="img" aria-label={`Priorità: ${valore} su 3`} className="inline-flex shrink-0 gap-px text-sm leading-none">
    {[1, 2, 3].map((v) => <span key={v} aria-hidden="true" className={v <= valore ? "text-gold" : "text-line"}>★</span>)}
  </span>;
}

export function SceltaPriorita({ valore, onChange, disabled = false }: { valore: number; onChange: (valore: number) => void; disabled?: boolean }) {
  const id = useId();
  return <fieldset disabled={disabled} className="min-w-0">
    <legend className="mb-1 text-xs font-semibold text-muted">Priorità</legend>
    <div className="flex flex-wrap gap-1">
      {(["Bassa", "Normale", "Alta"] as const).map((nome, i) => <label key={nome} className="cursor-pointer">
        <input className="peer sr-only" type="radio" name={`priorita-${id}`} value={i + 1} checked={valore === i + 1} onChange={() => onChange(i + 1)} aria-label={`${i + 1} ${i === 0 ? "stella" : "stelle"} · ${nome}`} />
        <span className="flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1.5 text-xs text-muted peer-checked:border-ocean peer-checked:bg-foam peer-checked:text-deep peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ocean peer-disabled:opacity-50"><span aria-hidden="true" className="text-gold">{"★".repeat(i + 1)}</span>{nome}</span>
      </label>)}
    </div>
  </fieldset>;
}
