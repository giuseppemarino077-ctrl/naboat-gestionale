// Schermata di manutenzione del sito: la vedono i visitatori quando NaBoat attiva il blocco.
// Sotto il messaggio c'è il collegamento all'accesso: chi entra con le proprie credenziali
// vede il sito normale (la sessione vale per tutto il dominio naboat.it).
import { LINK_PROGETTO, LINK_SONDAGGIO } from "@/lib/sito";

export function Manutenzione({
  titolo,
  testo,
  immagine,
  appBase,
}: {
  titolo: string;
  testo: string;
  immagine: string;
  appBase: string;
}) {
  return (
    <div className="relative isolate grid min-h-screen place-items-center overflow-hidden bg-deep px-5 py-14 text-center text-white">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${immagine})` }} aria-hidden />
      <div className="absolute inset-0 bg-[#03212d]/75" aria-hidden />

      <div className="relative w-full max-w-lg">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/15 backdrop-blur">
          <img src="/img/logo-naboat-bianco.png" alt="" className="h-9 w-auto" />
        </span>
        <p className="mt-3 font-display text-lg font-extrabold tracking-wide">NaBoat</p>

        <h1 className="mt-8 font-display text-3xl font-extrabold leading-tight md:text-4xl">{titolo}</h1>
        <p className="mx-auto mt-4 max-w-md whitespace-pre-line text-white/85">{testo}</p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <a
            className="inline-block rounded-[7px] bg-gold px-6 py-3 font-extrabold text-deep hover:brightness-110"
            href={LINK_SONDAGGIO}
            target="_blank"
            rel="noopener noreferrer"
          >
            Partecipa al sondaggio
          </a>
          <a
            className="inline-block rounded-[7px] bg-white/15 px-6 py-3 font-bold text-white hover:bg-white/25"
            href={LINK_PROGETTO}
          >
            Vedi il progetto
          </a>
        </div>
        <p className="mt-4">
          <a className="text-sm font-semibold text-white/70 underline hover:text-white" href="mailto:info@naboat.it">
            Scrivici: info@naboat.it
          </a>
        </p>

        <div className="mt-12 border-t border-white/15 pt-5">
          <a className="text-xs font-semibold text-white/60 underline hover:text-white" href={`/gestionale/accesso`}>
            Accesso amministratore
          </a>
        </div>
      </div>
    </div>
  );
}
