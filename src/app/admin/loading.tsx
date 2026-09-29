import { Icona } from "@/components/ui/Icona";

export default function CaricamentoAdmin() {
  return (
    <div role="status" aria-live="polite" className="grid gap-4">
      <div className="flex items-center gap-3 rounded-3xl border border-line bg-white p-5 text-sm font-medium text-muted shadow-sm">
        <Icona nome="caricamento" className="h-5 w-5 animate-spin text-ocean" />
        Carico il pannello…
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-foam/60" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-3xl bg-foam/40" />
    </div>
  );
}
