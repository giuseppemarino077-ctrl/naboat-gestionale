import Link from "next/link";
import { Icona } from "@/components/ui/Icona";

export default function PaginaNonTrovata() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#faf6f2] p-6">
      <div className="card grid max-w-md gap-3 p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-info-soft text-info">
          <Icona nome="pin" className="h-7 w-7" />
        </span>
        <p className="font-display text-3xl font-extrabold">404</p>
        <h1 className="font-display text-xl font-bold">Pagina non trovata</h1>
        <p className="text-sm text-muted">L&apos;indirizzo non esiste o non è più disponibile.</p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <Link className="btn-primary" href="/gestionale/oggi">
            Torna al gestionale
          </Link>
          <Link className="btn-soft" href="/">
            Vai al sito
          </Link>
        </div>
      </div>
    </div>
  );
}
