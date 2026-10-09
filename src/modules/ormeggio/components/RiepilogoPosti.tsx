"use client";
import { Icona, type NomeIcona } from "@/components/ui/Icona";

type Riepilogo = { totale: number; occupati: number; liberi: number; nonUsabili: number; daSistemare: number; bloccate: number };

export function RiepilogoPosti({ dati, onDaSistemare, aperto }: { dati?: Riepilogo; onDaSistemare: () => void; aperto: boolean }) {
  const voci: { nome: string; chiave: keyof Riepilogo; icona: NomeIcona; stile: string }[] = [
    { nome: "Posti totali", chiave: "totale", icona: "moduli", stile: "border-deep bg-deep text-white" },
    { nome: "Occupati", chiave: "occupati", icona: "barca", stile: "border-ocean bg-ocean text-white" },
    { nome: "Liberi", chiave: "liberi", icona: "ancora", stile: "border-signature bg-signature text-deep" },
    { nome: "Non utilizzabili", chiave: "nonUsabili", icona: "pausa", stile: "border-ocean/15 bg-foam text-deep" },
    { nome: "Da sistemare", chiave: "daSistemare", icona: "checklist", stile: "border-signature bg-gradient-to-br from-signature to-[#c4eee8] text-deep" },
    { nome: "Barche non disponibili", chiave: "bloccate", icona: "scudo", stile: "border-sea/25 bg-[#d4efed] text-deep" },
  ];
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 xl:grid-cols-6" aria-label="Riepilogo posti">
      {voci.map((v) => {
        const contenuto = <>
          <span className="flex items-center gap-1.5 text-[11px] font-semibold sm:text-xs"><Icona nome={v.icona} className="h-3.5 w-3.5 shrink-0 opacity-80" />{v.nome}</span>
          <span className="flex items-center sm:mt-1 justify-between gap-3"><strong className="font-display text-xl leading-none sm:text-2xl tracking-tight tabular-nums">{dati?.[v.chiave] ?? "–"}</strong>{v.chiave === "daSistemare" && <Icona nome="freccia-destra" className="h-4 w-4" />}</span>
        </>;
        const className = `flex min-w-[160px] shrink-0 items-center justify-between gap-3 sm:block rounded-[20px] border px-3 py-2.5 text-left shadow-[0_5px_16px_-10px_rgba(5,47,63,0.3)] sm:min-w-0 ${v.stile}`;
        return v.chiave === "daSistemare" ? <button key={v.chiave} className={`${className} transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none`} type="button" onClick={onDaSistemare} aria-haspopup="dialog" aria-expanded={aperto} aria-label={`Da sistemare: ${dati?.daSistemare ?? 0} posti. Mostra cosa sistemare`}>{contenuto}</button> : <div key={v.chiave} className={className}>{contenuto}</div>;
      })}
    </div>
  );
}
