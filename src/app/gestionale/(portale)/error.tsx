"use client";
import { useEffect } from "react";
import { Icona } from "@/components/ui/Icona";

export default function ErrorePortale({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="card grid gap-3 p-8 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger">
        <Icona nome="avviso" className="h-7 w-7" />
      </span>
      <h1 className="font-display text-xl font-bold">Questa sezione non si è caricata</h1>
      <p className="mx-auto max-w-md text-sm text-muted">
        Il resto del gestionale è ancora disponibile dal menù. Riprova a caricare la sezione.
      </p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        <button type="button" className="btn-primary" onClick={reset}>
          <Icona nome="ricarica" className="mr-1.5 h-4 w-4" /> Riprova
        </button>
        <a className="btn-soft" href="/gestionale/oggi">
          Torna a Oggi
        </a>
      </div>
    </div>
  );
}
