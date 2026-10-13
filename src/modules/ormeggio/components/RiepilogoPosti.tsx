"use client";
import { Icona, type NomeIcona } from "@/components/ui/Icona";
import type { CategoriaPosti } from "@/modules/ormeggio/evidenza-posti";

type Riepilogo = { totale: number; occupati: number; liberi: number; nonUsabili: number; daSistemare: number; bloccate: number };

export function RiepilogoPosti({ dati, onDaSistemare, aperto, selezione, onSelezione, onAnteprima }: {
  dati?: Riepilogo; onDaSistemare: () => void; aperto: boolean;
  selezione: CategoriaPosti | null; onSelezione: (categoria: CategoriaPosti) => void; onAnteprima: (categoria: CategoriaPosti | null) => void;
}) {
  const voci: { nome: string; chiave: CategoriaPosti | "totale" | "daSistemare"; icona: NomeIcona; stile: string }[] = [
    { nome: "Posti totali", chiave: "totale", icona: "moduli", stile: "border-deep bg-deep text-white" },
    { nome: "Occupati", chiave: "occupati", icona: "barca", stile: "border-ocean bg-ocean text-white" },
    { nome: "Liberi", chiave: "liberi", icona: "ancora", stile: "border-signature bg-signature text-deep" },
    { nome: "Non utilizzabili", chiave: "nonUsabili", icona: "pausa", stile: "border-ocean/15 bg-foam text-deep" },
    { nome: "Da sistemare", chiave: "daSistemare", icona: "checklist", stile: "border-signature bg-gradient-to-br from-signature to-[#c4eee8] text-deep" },
  ];
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 xl:grid-cols-5" aria-label="Riepilogo posti">
      {voci.map((v) => {
        const contenuto = <>
          <span className="flex items-center gap-1.5 text-[11px] font-semibold sm:text-xs"><Icona nome={v.icona} className="h-3.5 w-3.5 shrink-0 opacity-80" />{v.nome}</span>
          <span className="flex items-center sm:mt-1 justify-between gap-3"><strong className="font-display text-xl leading-none sm:text-2xl tracking-tight tabular-nums">{dati?.[v.chiave] ?? "–"}</strong>{v.chiave === "daSistemare" && <Icona nome="freccia-destra" className="h-4 w-4" />}</span>
        </>;
        const baseClassName = `flex min-w-[160px] shrink-0 items-center justify-between gap-3 sm:block rounded-[20px] border px-3 py-2.5 text-left sm:min-w-0 ${v.stile}`;
        const categoria = v.chiave;
        if (categoria === "totale") return <div key={categoria} className={baseClassName} data-riepilogo-posti="totale" aria-label="Posti totali">{contenuto}</div>;
        const className = `${baseClassName} shadow-[0_5px_16px_-10px_rgba(5,47,63,0.3)] transition hover:brightness-105 hover:shadow-md`;
        return categoria === "daSistemare" ? <button key={categoria} className={className} type="button" onClick={onDaSistemare} aria-haspopup="dialog" aria-expanded={aperto} aria-label={`Da sistemare: ${dati?.daSistemare ?? 0} posti. Mostra cosa sistemare`}>{contenuto}</button> : <button key={categoria} type="button" className={`${className} ${selezione === categoria ? "ring-2 ring-inset ring-current" : ""}`}
          data-riepilogo-posti={categoria} aria-pressed={selezione === categoria} aria-label={`${v.nome}: ${dati?.[categoria] ?? 0} posti. Evidenzia nel quadro`}
          onPointerEnter={(e) => { if (e.pointerType === "mouse") onAnteprima(categoria); }}
          onPointerLeave={(e) => onAnteprima(e.currentTarget.matches(":focus-visible") ? categoria : null)}
          onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) onAnteprima(categoria); }}
          onBlur={(e) => { if (!e.currentTarget.matches(":hover")) onAnteprima(null); }}
          onClick={() => onSelezione(categoria)}>{contenuto}</button>;
      })}
    </div>
  );
}
