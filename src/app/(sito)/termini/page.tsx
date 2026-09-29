import type { Metadata } from "next";
import { PaginaLegale, leggiTestoLegale } from "@/components/sito/PaginaLegale";
import { contestoSito } from "@/lib/sito-server";

export const metadata: Metadata = {
  title: "Termini di servizio — NaBoat",
  description: "Condizioni d'uso della piattaforma NaBoat.",
  robots: { index: true, follow: true },
};

// NOTA: il testo sotto è una bozza di lavoro. Finché NaBoat non configura il testo
// approvato (PlatformSettings.legaleTerminiTesto + legaleVersione) la pagina lo segnala.
export default async function TerminiPage() {
  const [legale, { appBase }] = await Promise.all([leggiTestoLegale("legaleTerminiTesto"), contestoSito()]);
  return (
    <PaginaLegale
      titolo="Termini di servizio"
      versione={legale.versione}
      aggiornatoAt={legale.aggiornatoAt}
      testo={legale.testo}
      appBase={appBase}
    >
      <p className="text-muted">Condizioni d&apos;uso della piattaforma.</p>

      <section className="grid gap-2">
        <h2 className="text-xl">1. Oggetto</h2>
        <p>
          NaBoat fornisce alle aziende di noleggio nautico un gestionale per flotta, prenotazioni, contratti, pagamenti
          e, dove attivo, il modulo ormeggio. Il servizio è multi-azienda: ogni azienda vede solo i propri dati.
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl">2. Account e responsabilità</h2>
        <p>
          L&apos;azienda è responsabile delle credenziali dei propri utenti e dei dati inseriti. È responsabile del
          trattamento dei dati dei propri clienti. Sono vietati usi illeciti o contrari alla buona fede.
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl">3. Servizi e corrispettivi</h2>
        <p>
          L&apos;uso del gestionale e l&apos;eventuale fee sulle prenotazioni provenienti dal canale NaBoat sono regolati dagli
          accordi commerciali tra NaBoat e l&apos;azienda (listino e condizioni personalizzate visibili nel portale).
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl">4. Disponibilità e limitazioni</h2>
        <p>
          Il servizio è erogato con continuità ma possono esservi manutenzioni programmate o interruzioni per cause di
          forza maggiore. Le copie di sicurezza sono eseguite periodicamente.
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl">5. Legge applicabile</h2>
        <p>Si applica la legge italiana. Per ogni controversia è competente il foro da concordare tra le parti.</p>
      </section>
    </PaginaLegale>
  );
}
