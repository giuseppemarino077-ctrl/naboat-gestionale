import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termini di servizio — NaBoat",
  description: "Condizioni d'uso della piattaforma NaBoat.",
  robots: { index: true, follow: true },
};

// NOTA: testo redatto come base da far verificare prima della pubblicazione definitiva.
export default function TerminiPage() {
  return (
    <article className="mx-auto grid max-w-3xl gap-5 px-5 py-12 text-sm leading-relaxed text-ink">
      <h1 className="text-3xl">Termini di servizio</h1>
      <p className="text-muted">Condizioni d'uso della piattaforma. Ultimo aggiornamento: da definire.</p>

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
          L'azienda è responsabile delle credenziali dei propri utenti e dei dati inseriti. È responsabile del
          trattamento dei dati dei propri clienti. Sono vietati usi illeciti o contrari alla buona fede.
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl">3. Servizi e corrispettivi</h2>
        <p>
          L'uso del gestionale e l'eventuale fee sulle prenotazioni provenienti dal canale NaBoat sono regolati dagli
          accordi commerciali tra NaBoat e l'azienda (listino e condizioni personalizzate visibili nel portale).
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

      <nav className="border-t border-line pt-4">
        <a className="font-bold text-ocean" href="/">← Torna al sito</a>
      </nav>
    </article>
  );
}
