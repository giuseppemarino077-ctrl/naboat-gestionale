import type { Metadata } from "next";
import { IntestazioneSito } from "@/components/sito/IntestazioneSito";
import { PiedeSito } from "@/components/sito/PiedeSito";
import { Manutenzione } from "@/components/sito/Manutenzione";
import { statoManutenzione } from "@/lib/manutenzione";
import { contestoSito } from "@/lib/sito-server";

export const metadata: Metadata = {
  title: "Chi siamo — NaBoat",
  description:
    "NaBoat semplifica il noleggio nautico: un gestionale per le aziende e un unico posto dove trovare barche, prezzi chiari e skipper.",
  robots: { index: true, follow: true },
};

export default async function PaginaChiSiamo() {
  const { appBase } = await contestoSito();

  const man = await statoManutenzione();
  if (man.attiva) return <Manutenzione titolo={man.titolo} testo={man.testo} immagine={man.immagine} appBase={appBase} />;

  return (
    <div className="bg-white text-ink">
      <IntestazioneSito appBase={appBase} />

      <main className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-ocean">Chi siamo</p>
        <h1 className="mt-3 font-display text-3xl font-extrabold leading-tight text-deep md:text-4xl">
          Il noleggio nautico, organizzato bene.
        </h1>

        <p className="mt-6 text-muted">
          NaBoat nasce da un'idea semplice: chi noleggia una barca deve pensare solo a godersi il mare, e chi la
          noleggia deve poter gestire l'attività senza rincorrere telefoni, fogli di calcolo e appunti.
        </p>
        <p className="mt-4 text-muted">
          Lavoriamo con le aziende di noleggio per riunire in un unico posto prenotazioni, calendario, pagamenti,
          contratti e resoconto economico. E con i clienti finali per trovare la barca giusta, con prezzi chiari e
          contatti diretti.
        </p>
        <p className="mt-4 text-muted">
          Il portale e il sito sono gestiti in Italia, con copie di sicurezza giornaliere e assistenza in italiano.
        </p>

        <div className="mt-9 flex flex-wrap gap-3">
          <a className="btn-primary px-5 py-3" href={`/gestionale/registrazione`}>
            Registra la tua azienda
          </a>
          <a className="rounded-[7px] border border-line px-5 py-3 font-bold text-ocean" href="/contatti">
            Contattaci
          </a>
        </div>
      </main>

      <PiedeSito appBase={appBase} />
    </div>
  );
}
