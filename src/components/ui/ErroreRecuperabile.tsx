"use client";
import Link from "next/link";
import { Icona } from "./Icona";

export function ErroreRecuperabile({
  titolo = "Qualcosa non ha funzionato",
  messaggio,
  onRiprova,
  riprovaLabel = "Riprova",
  collega,
}: {
  titolo?: string;
  messaggio: React.ReactNode;
  onRiprova?: () => void;
  riprovaLabel?: string;
  collega?: { href: string; label: string };
}) {
  return (
    <div role="alert" className="grid gap-3 rounded-3xl border border-danger-line bg-danger-soft p-6 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-danger">
        <Icona nome="avviso" className="h-6 w-6" />
      </span>
      <p className="font-display text-lg font-bold text-danger">{titolo}</p>
      <p className="mx-auto max-w-md text-sm text-ink/80">{messaggio}</p>
      {(onRiprova || collega) && (
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {onRiprova && (
            <button type="button" className="btn-primary" onClick={onRiprova}>
              <Icona nome="ricarica" className="mr-1.5 h-4 w-4" />
              {riprovaLabel}
            </button>
          )}
          {collega && (
            <Link className="btn-soft" href={collega.href}>
              {collega.label}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
