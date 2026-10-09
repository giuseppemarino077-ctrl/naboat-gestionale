import Link from "next/link";
import type { ReactNode } from "react";

export function IntestazioneOrmeggio({ titolo, descrizione, azioni, indietro = true }: {
  titolo: string;
  descrizione?: string;
  azioni?: ReactNode;
  indietro?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        {indietro ? <Link className="text-xs font-semibold text-ocean hover:underline" href="/gestionale/ormeggio">← Quadro posti</Link> : <p className="hidden text-xs font-semibold uppercase tracking-wide text-muted sm:block">Ormeggio · Gestione interna</p>}
        <h1 className="text-2xl leading-tight">{titolo}</h1>
        {descrizione && <p className="mt-1 text-sm text-muted">{descrizione}</p>}
      </div>
      {azioni && <div className="flex flex-wrap items-center gap-2">{azioni}</div>}
    </header>
  );
}

export function RiepilogoOrmeggio({ voci }: { voci: { nome: string; valore: ReactNode }[] }) {
  return (
    <div className="flex min-w-0 flex-nowrap gap-x-5 gap-y-2 overflow-x-auto rounded-xl sm:flex-wrap border border-line bg-white px-3 py-2 text-sm">
      {voci.map((v) => <div key={v.nome} className="flex shrink-0 items-baseline gap-2 whitespace-nowrap"><span className="text-muted">{v.nome}</span><strong className="tabular-nums text-deep">{v.valore}</strong></div>)}
    </div>
  );
}
