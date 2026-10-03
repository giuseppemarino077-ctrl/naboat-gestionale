"use client";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ServiziPage() {
  const { id } = useParams<{ id: string }>();
  const card = "card p-5 hover:border-ocean";
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted">Dotazione inclusa ed extra acquistabile sono concetti diversi: qui si configurano separatamente.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Link href={`/gestionale/flotta/${id}/extra`} className={card}>
          <h2 className="font-display text-lg font-bold text-ink">Servizi aggiuntivi</h2>
          <p className="mt-1 text-sm text-muted">Catalogo extra dell'azienda e associazione alla barca, con prezzo e quantità personalizzati.</p>
          <span className="mt-3 inline-block font-semibold text-ocean">Gestisci extra →</span>
        </Link>
        <Link href={`/gestionale/flotta/${id}/dotazioni`} className={card}>
          <h2 className="font-display text-lg font-bold text-ink">Dotazioni presenti</h2>
          <p className="mt-1 text-sm text-muted">Dotazioni incluse a bordo, raggruppate per categoria, con nota per singola voce.</p>
          <span className="mt-3 inline-block font-semibold text-ocean">Gestisci dotazioni →</span>
        </Link>
      </div>
    </div>
  );
}
