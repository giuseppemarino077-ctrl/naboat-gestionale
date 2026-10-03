"use client";
import { useEffect } from "react";
import { Icona } from "@/components/ui/Icona";

export default function ErroreGlobale({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid min-h-screen place-items-center bg-[#f7faf9] p-6">
      <div className="card grid max-w-md gap-3 p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger">
          <Icona nome="avviso" className="h-7 w-7" />
        </span>
        <h1 className="font-display text-2xl font-bold">Qualcosa non ha funzionato</h1>
        <p className="text-sm text-muted">
          La pagina non è riuscita a caricarsi. Puoi riprovare: se il problema resta, contatta l&apos;assistenza NaBoat.
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
    </div>
  );
}
