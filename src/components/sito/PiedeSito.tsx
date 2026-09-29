// Piede del sito pubblico: identità, contatti e strade per entrare nel portale.
import { LINK_PROGETTO, LINK_SONDAGGIO } from "@/lib/sito";

export function PiedeSito({ appBase }: { appBase: string }) {
  return (
    <footer className="bg-[#031f2a] text-[#a8c2c5]">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 text-sm md:grid-cols-3">
        <div>
          <p className="flex items-center gap-2 font-display text-lg font-extrabold text-white">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><img src="/img/logo-naboat-bianco.png" alt="" className="h-5 w-auto" /></span>
            NaBoat
          </p>
          <p className="mt-3">Il noleggio nautico, organizzato bene.</p>
          <a className="mt-2 inline-block font-semibold text-aqua" href="mailto:info@naboat.it">
            info@naboat.it
          </a>
        </div>
        <div>
          <p className="font-bold text-white">Portale aziende</p>
          <a className="mt-2 block hover:text-white" href={`/gestionale/accesso`}>
            Accedi
          </a>
          <a className="mt-1 block hover:text-white" href={`/gestionale/registrazione`}>
            Registra la tua azienda
          </a>
        </div>
        <div>
          <p className="font-bold text-white">Sito</p>
          <a className="mt-2 block hover:text-white" href="/chi-siamo">
            Chi siamo
          </a>
          <a className="mt-1 block hover:text-white" href="/contatti">
            Contatti
          </a>
          <a className="mt-1 block hover:text-white" href={LINK_PROGETTO}>
            Vedi il progetto
          </a>
          <a className="mt-1 block font-semibold text-aqua hover:text-white" href={LINK_SONDAGGIO} target="_blank" rel="noopener noreferrer">
            Partecipa al sondaggio
          </a>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">
        © {new Date().getFullYear()} NaBoat · Server e copie di sicurezza in Italia
        <div className="mt-2 flex flex-wrap justify-center gap-4">
          <a className="hover:text-white" href="/privacy">Privacy</a>
          <a className="hover:text-white" href="/cookie">Cookie</a>
          <a className="hover:text-white" href="/termini">Termini</a>
        </div>
      </div>
    </footer>
  );
}
