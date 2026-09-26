import type { Metadata } from "next";
import { IntestazioneSito } from "@/components/sito/IntestazioneSito";
import { PiedeSito } from "@/components/sito/PiedeSito";
import { FormContatti } from "@/components/sito/FormContatti";
import { Manutenzione } from "@/components/sito/Manutenzione";
import { statoManutenzione } from "@/lib/manutenzione";
import { contestoSito } from "@/lib/sito-server";

export const metadata: Metadata = {
  title: "Contatti — NaBoat",
  description: "Scrivici per informazioni sul noleggio, un preventivo o per conoscere il gestionale NaBoat. Ti ricontattiamo entro un giorno lavorativo.",
  robots: { index: true, follow: true },
};

export default async function PaginaContatti() {
  const { appBase } = await contestoSito();

  const man = await statoManutenzione();
  if (man.attiva) return <Manutenzione titolo={man.titolo} testo={man.testo} immagine={man.immagine} appBase={appBase} />;

  return (
    <div className="bg-white text-ink">
      <IntestazioneSito appBase={appBase} />

      <main className="mx-auto max-w-5xl px-5 py-16">
        <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-ocean">Contatti</p>
        <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight text-deep md:text-4xl">Parliamone.</h1>
        <p className="mt-6 max-w-2xl text-muted">
          Scrivici e ti rispondiamo entro un giorno lavorativo: per informazioni sul noleggio, per un preventivo o per
          capire come funziona il gestionale.
        </p>

        <div className="mt-10 grid gap-8 md:grid-cols-[1fr_1.15fr]">
          <div className="grid content-start gap-4">
            <a
              className="inline-block justify-self-start rounded-[7px] bg-ocean px-6 py-3 font-bold text-white hover:brightness-110"
              href="mailto:info@naboat.it"
            >
              info@naboat.it
            </a>

            <div className="card p-5">
              <h2 className="font-display text-lg font-bold text-deep">Hai un'azienda di noleggio?</h2>
              <p className="mt-1 text-sm text-muted">Registra l'azienda in due minuti: poi ti accompagniamo noi nell'attivazione.</p>
              <a className="mt-3 inline-block font-bold text-ocean" href={`${appBase}/registrazione`}>
                Registra la tua azienda →
              </a>
            </div>

            <div className="card p-5">
              <h2 className="font-display text-lg font-bold text-deep">Sei già cliente?</h2>
              <p className="mt-1 text-sm text-muted">Entra nel portale per gestire prenotazioni, pagamenti e resoconto.</p>
              <a className="mt-3 inline-block font-bold text-ocean" href={`${appBase}/login`}>
                Accedi al portale →
              </a>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="font-display text-xl font-bold text-deep">Lascia i tuoi recapiti</h2>
            <p className="mt-1 text-sm text-muted">Ti ricontattiamo noi, senza impegno.</p>
            <div className="mt-4">
              <FormContatti />
            </div>
          </div>
        </div>
      </main>

      <PiedeSito appBase={appBase} />
    </div>
  );
}
