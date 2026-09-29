import Link from "next/link";
import { Icona } from "@/components/ui/Icona";

export default function NonTrovatoPortale() {
  return (
    <div className="card grid gap-3 p-8 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-info-soft text-info">
        <Icona nome="pin" className="h-7 w-7" />
      </span>
      <h1 className="font-display text-xl font-bold">Sezione non trovata</h1>
      <p className="mx-auto max-w-md text-sm text-muted">L&apos;indirizzo non esiste oppure la funzione è stata spostata.</p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        <Link className="btn-primary" href="/gestionale/oggi">
          Torna a Oggi
        </Link>
        <Link className="btn-soft" href="/gestionale/prenotazioni">
          Vai alle prenotazioni
        </Link>
      </div>
    </div>
  );
}
