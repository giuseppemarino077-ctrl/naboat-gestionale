"use client";
import Link from "next/link";
import { Icona, type NomeIcona } from "./Icona";

export type AzioneVuoto = { label: string; href?: string; onClick?: () => void };

function Bottone({ azione, primario }: { azione: AzioneVuoto; primario: boolean }) {
  const classe = primario ? "btn-primary" : "btn-soft";
  if (azione.href) {
    return (
      <Link href={azione.href} className={classe}>
        {azione.label}
      </Link>
    );
  }
  return (
    <button type="button" className={classe} onClick={azione.onClick}>
      {azione.label}
    </button>
  );
}

export function StatoVuoto({
  icona = "info",
  titolo,
  testo,
  azione,
  secondaria,
}: {
  icona?: NomeIcona;
  titolo: string;
  testo?: React.ReactNode;
  azione?: AzioneVuoto;
  secondaria?: AzioneVuoto;
}) {
  return (
    <div className="grid place-items-center gap-3 rounded-3xl border border-dashed border-line bg-white p-8 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-foam text-ocean">
        <Icona nome={icona} className="h-7 w-7" />
      </span>
      <p className="font-display text-lg font-bold">{titolo}</p>
      {testo && <p className="max-w-md text-sm text-muted">{testo}</p>}
      {(azione || secondaria) && (
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {azione && <Bottone azione={azione} primario />}
          {secondaria && <Bottone azione={secondaria} primario={false} />}
        </div>
      )}
    </div>
  );
}
