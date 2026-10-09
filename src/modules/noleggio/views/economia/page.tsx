import Link from "next/link";

// Economia: raggruppa gli incassi (Pagamenti) e il resoconto di margine.
export default function EconomiaPage() {
  const voci = [
    {
      href: "/gestionale/economia/pagamenti",
      titolo: "Pagamenti",
      testo: "Registro degli incassi, acconti, saldi, cauzioni e rimborsi.",
    },
    {
      href: "/gestionale/economia/resoconto",
      titolo: "Resoconto",
      testo: "Incassi, spese e margine per periodo e per barca; esportazione CSV.",
    },
  ];

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div>
        <p className="text-sm text-muted">Economia</p>
        <h1 className="text-2xl">Incassi, spese e margine</h1>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {voci.map((v) => (
          <Link key={v.href} href={v.href} className="card p-5 transition hover:shadow-md">
            <h2 className="font-display text-lg font-bold text-deep">{v.titolo}</h2>
            <p className="mt-1 text-sm text-muted">{v.testo}</p>
            <span className="mt-3 inline-block text-sm font-bold text-ocean">Apri →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
