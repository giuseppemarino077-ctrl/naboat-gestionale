import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Informativa privacy — NaBoat",
  description: "Come NaBoat tratta i dati personali di aziende, clienti e visitatori del sito.",
  robots: { index: true, follow: true },
};

// NOTA: testo redatto come base da far verificare prima della pubblicazione definitiva.
export default function PrivacyPage() {
  return (
    <article className="mx-auto grid max-w-3xl gap-5 px-5 py-12 text-sm leading-relaxed text-ink">
      <h1 className="text-3xl">Informativa privacy</h1>
      <p className="text-muted">
        Ai sensi degli articoli 13 e 14 del Regolamento (UE) 2016/679 («GDPR»). Ultimo aggiornamento: da definire.
      </p>

      <section className="grid gap-2">
        <h2 className="text-xl">1. Titolare del trattamento</h2>
        <p>
          NaBoat — contatto: <a className="font-bold text-ocean" href="mailto:info@naboat.it">info@naboat.it</a>. I dati
          inseriti nel gestionale da ciascuna azienda di noleggio (flotta, clienti, prenotazioni, foto) sono trattati
          dalla singola azienda, che ne è titolare autonoma; NaBoat li tratta come responsabile (fornitore del servizio).
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl">2. Dati trattati</h2>
        <ul className="list-disc pl-5">
          <li>Dati di contatto e account: nome, cognome, email, telefono, ruolo aziendale.</li>
          <li>Dati dell'azienda: denominazione, indirizzo di partenza, logo, dati di pagamento configurati (le chiavi dei circuiti sono cifrate).</li>
          <li>Dati operativi: barche, clienti, prenotazioni, contratti firmati digitalmente, foto di check-in/check-out.</li>
          <li>Dati tecnici: indirizzo IP, log di sicurezza e registro delle modifiche.</li>
          <li>Pagamenti: i dati della carta sono gestiti dal fornitore di pagamento (Stripe); NaBoat non li conserva.</li>
        </ul>
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl">3. Finalità e basi giuridiche</h2>
        <p>
          Erogazione del servizio (contratto), adempimenti fiscali e contabili (obbligo di legge), sicurezza e
          prevenzione abusi (legittimo interesse), comunicazioni richieste dal cliente (consenso o esecuzione del
          contratto). Il modulo «Contatti» richiede il consenso esplicito.
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl">4. Conservazione</h2>
        <p>
          I dati sono conservati per il tempo necessario alle finalità e agli obblighi di legge. Le copie di sicurezza
          sono tenute su server in Italia e conservate secondo la retention configurata.
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl">5. Destinatari</h2>
        <p>
          Fornitori tecnici: hosting e server (Aruba, Italia), invio email (SMTP del dominio), pagamenti (Stripe),
          protezione anti-bot (Cloudflare Turnstile). I dati non sono ceduti a terzi per finalità di marketing.
        </p>
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl">6. Diritti dell'interessato</h2>
        <p>
          Accesso, rettifica, cancellazione, limitazione, opposizione e portabilità. Le richieste si inviano a{" "}
          <a className="font-bold text-ocean" href="mailto:info@naboat.it">info@naboat.it</a>. È possibile proporre
          reclamo al Garante per la protezione dei dati personali.
        </p>
      </section>

      <nav className="border-t border-line pt-4">
        <a className="font-bold text-ocean" href="/">← Torna al sito</a>
      </nav>
    </article>
  );
}
