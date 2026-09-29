"use client";
import { useEffect } from "react";
import { Icona } from "@/components/ui/Icona";

export default function ErroreAdmin({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto grid max-w-md gap-3 rounded-3xl border border-danger-line bg-white p-8 text-center shadow-sm">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger">
        <Icona nome="avviso" className="h-7 w-7" />
      </span>
      <h1 className="font-display text-xl font-bold">Il pannello non si è caricato</h1>
      <p className="text-sm text-muted">Riprova: se il problema resta, controlla i log del server.</p>
      <div className="mt-1 flex justify-center">
        <button type="button" className="btn-primary" onClick={reset}>
          <Icona nome="ricarica" className="mr-1.5 h-4 w-4" /> Riprova
        </button>
      </div>
    </div>
  );
}
