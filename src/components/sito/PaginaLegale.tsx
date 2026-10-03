import { prisma } from "@/lib/db";
import { IntestazioneSito } from "./IntestazioneSito";
import { PiedeSito } from "./PiedeSito";

// Pagine legali del sito (privacy, termini, cookie). Sono pagine informative aperte a
// chiunque, senza accesso: qui non si usano componenti del gestionale né reindirizzamenti
// al login. Il testo definitivo arriva da PlatformSettings; finché non è configurato si
// mostra un avviso di configurazione incompleta e la bozza resta chiaramente marcata.

export type TestoLegaleCampo = "legalePrivacyTesto" | "legaleTerminiTesto" | "legaleCookieTesto";

const dataIt = (d: Date) => d.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });

// Legge versione, data e testo approvato per una delle tre pagine legali.
export async function leggiTestoLegale(campo: TestoLegaleCampo) {
  const s = await prisma.platformSettings
    .findUnique({
      where: { id: "singleton" },
      select: {
        legaleVersione: true,
        legaleAggiornatoAt: true,
        legalePrivacyTesto: true,
        legaleTerminiTesto: true,
        legaleCookieTesto: true,
      },
    })
    .catch(() => null);
  return {
    versione: s?.legaleVersione?.trim() || null,
    aggiornatoAt: s?.legaleAggiornatoAt ?? null,
    testo: s?.[campo]?.trim() || null,
  };
}

export function PaginaLegale({
  titolo,
  versione,
  aggiornatoAt,
  testo,
  appBase,
  children,
}: {
  titolo: string;
  versione: string | null;
  aggiornatoAt: Date | null;
  testo: string | null;
  appBase: string;
  children: React.ReactNode;
}) {
  const configurato = !!testo && !!versione;

  return (
    <div className="bg-white text-ink">
      <IntestazioneSito appBase={appBase} />

      <article className="mx-auto grid max-w-3xl gap-5 px-5 py-12 text-sm leading-relaxed text-ink">
        <h1 className="text-3xl">{titolo}</h1>

        {configurato ? (
          <>
            <p className="text-muted">
              Versione {versione}
              {aggiornatoAt ? ` · aggiornato il ${dataIt(aggiornatoAt)}` : ""}
            </p>
            <div className="whitespace-pre-line">{testo}</div>
          </>
        ) : (
          <>
            <div className="rounded-[14px] border border-warn-line bg-warn-soft p-4 text-warn">
              <p className="font-bold">Configurazione incompleta</p>
              <p className="mt-1">
                Il testo definitivo di questa pagina non è ancora stato approvato e configurato da NaBoat. Quello che
                segue è una <b>bozza di lavoro</b> e non ha valore legale.
              </p>
            </div>
            {children}
          </>
        )}

        <nav className="border-t border-line pt-4">
          <a className="font-bold text-ocean" href="/">
            ← Torna al sito
          </a>
        </nav>
      </article>

      <PiedeSito appBase={appBase} />
    </div>
  );
}
