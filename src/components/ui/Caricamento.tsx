"use client";
import { Icona } from "./Icona";

export function Caricamento({ testo = "Caricamento…", className = "" }: { testo?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={"flex items-center justify-center gap-2.5 p-8 text-sm font-medium text-muted " + className}>
      <Icona nome="caricamento" className="h-5 w-5 animate-spin text-ocean" />
      {testo}
    </div>
  );
}
