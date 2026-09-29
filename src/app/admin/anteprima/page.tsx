import { HomePubblica } from "@/components/sito/HomePubblica";
import { contenutiHome } from "@/lib/home";
import { contestoSito } from "@/lib/sito-server";

// Anteprima della home del sito, riservata a chi ha già l'accesso.
// Serve a NaBoat per vedere come apparirà su naboat.it prima del passaggio del dominio.
export default async function PaginaAnteprima() {
  const { appBase } = await contestoSito();
  const contenuti = await contenutiHome();

  return (
    <div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-gold px-4 py-2 text-center text-sm font-bold text-[#3a2708]">
        <span>Anteprima riservata — questa sarà la home di naboat.it. Non è ancora pubblica.</span>
        <a className="underline" href="/gestionale/oggi">
          Torna al gestionale →
        </a>
      </div>
      <HomePubblica appBase={appBase} contenuti={contenuti} />
    </div>
  );
}
