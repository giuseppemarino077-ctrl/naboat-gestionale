import type { Metadata } from "next";
import { PaginaLegale, leggiTestoLegale } from "@/components/sito/PaginaLegale";
import { contestoSito } from "@/lib/sito-server";

export const metadata: Metadata = {
  title: "Cookie — NaBoat",
  description: "Quali cookie usa NaBoat e perché.",
  robots: { index: true, follow: true },
};

// NOTA: il testo sotto è una bozza di lavoro. Finché NaBoat non configura il testo
// approvato (PlatformSettings.legaleCookieTesto + legaleVersione) la pagina lo segnala.
export default async function CookiePage() {
  const [legale, { appBase }] = await Promise.all([leggiTestoLegale("legaleCookieTesto"), contestoSito()]);
  return (
    <PaginaLegale
      titolo="Cookie"
      versione={legale.versione}
      aggiornatoAt={legale.aggiornatoAt}
      testo={legale.testo}
      appBase={appBase}
    >
      <p className="text-muted">
        NaBoat usa solo cookie tecnici necessari al funzionamento. Non usa cookie di profilazione o pubblicitari.
      </p>

      <section className="grid gap-2">
        <h2 className="text-xl">Cookie tecnici</h2>
        <ul className="list-disc pl-5">
          <li>
            <b>nb_session</b>: mantiene l&apos;accesso al portale (token di sessione, cookie httpOnly). Senza questo cookie non
            è possibile accedere all&apos;area riservata.
          </li>
        </ul>
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl">Servizi di terze parti</h2>
        <ul className="list-disc pl-5">
          <li>
            <b>Cloudflare Turnstile</b>: verifica anti-bot su accesso, registrazione e form contatti; può impostare
            cookie tecnici di sicurezza.
          </li>
          <li>
            <b>Stripe</b>: nelle pagine di pagamento il fornitore può impostare propri cookie necessari alla transazione.
          </li>
          <li>
            <b>Modulo di sondaggio (Google Forms)</b>: si apre solo se lo apri tu, su dominio esterno.
          </li>
        </ul>
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl">Gestione dal browser</h2>
        <p>
          Puoi eliminare o bloccare i cookie dalle impostazioni del browser. Bloccando il cookie di sessione non potrai
          però accedere al portale.
        </p>
      </section>
    </PaginaLegale>
  );
}
