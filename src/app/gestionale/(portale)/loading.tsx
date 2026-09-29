import { Icona } from "@/components/ui/Icona";

export default function CaricamentoPortale() {
  return (
    <div role="status" aria-live="polite" className="grid gap-4">
      <div className="card flex items-center gap-3 p-5 text-sm font-medium text-muted">
        <Icona nome="caricamento" className="h-5 w-5 animate-spin text-ocean" />
        Carico la sezione…
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-24 animate-pulse bg-foam/60" />
        ))}
      </div>
      <div className="card h-64 animate-pulse bg-foam/40" />
    </div>
  );
}
