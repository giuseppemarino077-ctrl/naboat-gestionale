import { IntestazioneSito } from "@/components/sito/IntestazioneSito";
import { PiedeSito } from "@/components/sito/PiedeSito";
import type { ContenutiHome } from "@/lib/home";

const PASSI = [
  { n: "1", t: "Trova la barca giusta", d: "Sfoglia le aziende NaBoat: barche, prezzi e disponibilità in chiaro." },
  { n: "2", t: "Prenota o chiedi informazioni", d: "Contatti l'azienda in un clic. Dove è attivo, prenoti e paghi online." },
  { n: "3", t: "Sali a bordo e salpa", d: "Contratto digitale, check-in rapido e skipper, se ti serve. Al resto pensiamo noi." },
];

const VANTAGGI = [
  "Calendario e prenotazioni sotto controllo",
  "Pagamenti online e cauzione con blocco carta",
  "Contratti digitali e check-in con foto",
  "Resoconto di incassi, spese e margini per barca",
];

const MONDI = [
  { t: "Per chi naviga", d: "Cerca, confronta e salpa: prezzi trasparenti e pagamenti sicuri." },
  { t: "Per chi noleggia", d: "Un gestionale completo, senza fogli di calcolo né telefonate." },
  { t: "Per chi lavora a bordo", d: "Turni degli skipper ordinati, senza chiamate all'alba." },
];

const DOMANDE = [
  {
    d: "Che cos'è NaBoat?",
    r: "NaBoat riunisce le aziende di noleggio nautico e i loro clienti: un gestionale completo per le aziende e un unico posto dove trovare barche, prezzi chiari e contatti diretti.",
  },
  {
    d: "Quanto costa per chi noleggia una barca?",
    r: "Chiedere informazioni è gratuito e senza impegno: il noleggio si paga all'azienda, con le condizioni indicate prima della conferma.",
  },
  {
    d: "Come funziona la cauzione?",
    r: "L'azienda può bloccare una somma sulla carta tramite NaBoat: il blocco si libera al rientro se tutto è in ordine.",
  },
  {
    d: "Serve la patente nautica?",
    r: "Dipende dalla barca: molte si noleggiano senza patente entro i limiti di legge, altre richiedono lo skipper o la patente. L'azienda te lo conferma alla prenotazione.",
  },
  {
    d: "Posso disdire la prenotazione?",
    r: "Le condizioni di annullamento e rimborso le indica l'azienda: le trovi prima di confermare.",
  },
  {
    d: "Sono un noleggiatore: come inizio?",
    r: "Registri l'azienda dal sito in due minuti, senza impegno. NaBoat ti ricontatta e ti accompagna nell'attivazione di gestionale e pagamenti.",
  },
  {
    d: "I miei dati sono al sicuro?",
    r: "Sì: server in Italia, connessioni cifrate e copie di sicurezza giornaliere.",
  },
];

// Home del sito pubblico: si apre su naboat.it. Testi e foto arrivano dal pannello NaBoat.
export function HomePubblica({ appBase, contenuti }: { appBase: string; contenuti: ContenutiHome }) {
  return (
    <div className="bg-white text-ink">
      <IntestazioneSito appBase={appBase} />

      <section className="relative isolate overflow-hidden bg-deep">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${contenuti.immagine})` }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#2a1408]/70 via-[#2a1408]/60 to-[#2a1408]/85" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-5 py-24 text-center text-white md:py-32">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-aqua">
            Noleggio barche · Aziende · Skipper
          </p>
          <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight md:text-5xl">{contenuti.titolo}</h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/85 md:text-lg">{contenuti.sottotitolo}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a className="btn-primary px-6 py-3 text-base" href="#come-funziona">
              Scopri come funziona
            </a>
            <a
              className="rounded-[7px] bg-gold px-6 py-3 text-base font-extrabold text-[#3a2708] hover:brightness-110"
              href={`${appBase}/registrazione`}
            >
              Sei un noleggiatore? Registrati
            </a>
          </div>
          <p className="mt-6 text-xs tracking-wide text-white/70">
            Server in Italia · Copie di sicurezza giornaliere · Assistenza in italiano
          </p>
        </div>
      </section>

      <section id="come-funziona" className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-center font-display text-3xl font-extrabold text-deep">Come funziona</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PASSI.map((p) => (
            <div key={p.n} className="card p-5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-foam font-display font-extrabold text-ocean">
                {p.n}
              </span>
              <h3 className="mt-3 font-display text-lg font-bold text-deep">{p.t}</h3>
              <p className="mt-1 text-sm text-muted">{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-deep text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 py-16 md:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="font-display text-3xl font-extrabold">Sei un noleggiatore?</h2>
            <p className="mt-3 max-w-xl text-white/80">
              NaBoat è il gestionale che semplifica il tuo noleggio: prenotazioni, calendario, pagamenti, contratti e
              resoconto in un unico posto.
            </p>
            <ul className="mt-5 grid gap-2 text-sm text-white/90 sm:grid-cols-2">
              {VANTAGGI.map((v) => (
                <li key={v} className="flex gap-2">
                  <span className="text-aqua">✓</span>
                  {v}
                </li>
              ))}
            </ul>
          </div>
          <div className="text-center">
            <a
              className="inline-block rounded-[7px] bg-gold px-6 py-3 font-extrabold text-[#3a2708] hover:brightness-110"
              href={`${appBase}/registrazione`}
            >
              Registra la tua azienda
            </a>
            <p className="mt-3 text-xs text-white/60">Attivazione guidata, nessuna installazione.</p>
            <a className="mt-2 inline-block text-sm font-bold text-aqua underline" href={`${appBase}/login`}>
              Hai già un account? Accedi
            </a>
          </div>
        </div>
      </section>

      <section className="bg-sand">
        <div className="mx-auto grid max-w-6xl gap-4 px-5 py-14 md:grid-cols-3">
          {MONDI.map((m) => (
            <div key={m.t} className="rounded-[18px] border border-[#e9e2d6] bg-white p-5">
              <h3 className="font-display text-lg font-bold text-deep">{m.t}</h3>
              <p className="mt-1 text-sm text-muted">{m.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-16">
        <h2 className="text-center font-display text-3xl font-extrabold text-deep">Domande frequenti</h2>
        <div className="mt-8 grid gap-2">
          {DOMANDE.map((q) => (
            <details key={q.d} className="card p-4">
              <summary className="cursor-pointer list-none font-semibold text-deep">{q.d}</summary>
              <p className="mt-2 text-sm text-muted">{q.r}</p>
            </details>
          ))}
        </div>
      </section>

      <PiedeSito appBase={appBase} />
    </div>
  );
}
