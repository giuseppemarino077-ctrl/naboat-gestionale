import type { Metadata } from "next";
import { IntestazioneSito } from "@/components/sito/IntestazioneSito";
import { PiedeSito } from "@/components/sito/PiedeSito";
import { catalogoPubblico } from "@/lib/marketplace";
import { contestoSito } from "@/lib/sito-server";

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export const metadata: Metadata = {
  title: "Noleggia una barca — scegli, richiedi, salpa | NaBoat",
  description:
    "Noleggia una barca a Napoli, Capri, Ischia, Procida e Salerno: scegli tra le barche pubblicate, invia la richiesta e salpa. Barche senza patente e con skipper.",
  robots: { index: true, follow: true },
};

const PASSI = [
  { n: "1", t: "Scegli", d: "Filtra per tipo e porto, guarda foto, capienza, prezzo di partenza e se serve la patente." },
  { n: "2", t: "Richiedi", d: "Invia la richiesta all'azienda con data e numero di persone: ricevi conferma e regole prima di pagare." },
  { n: "3", t: "Salpa", d: "Ci vediamo in banchina: check-in rapido, contratto digitale e skipper se ti serve." },
];

const DOMANDE = [
  { d: "Serve la patente nautica?", r: "Dipende dalla barca: molte si noleggiano senza patente entro i limiti di legge; le più potenti la richiedono oppure si noleggiano con skipper." },
  { d: "Posso noleggiare con lo skipper?", r: "Sì: nella scheda della barca è indicato se è previsto lo skipper. In quel caso non serve la patente." },
  { d: "Come funziona la richiesta?", r: "Non è una conferma automatica: l'azienda verifica la disponibilità e ti risponde con le condizioni. Le regole le trovi prima di pagare." },
  { d: "La cauzione?", r: "Dove è attiva, la cauzione si blocca sulla carta e si libera al rientro se tutto è in ordine. I dettagli li indica l'azienda." },
];

export default async function NoleggiaPage({ searchParams }: { searchParams: Promise<{ tipo?: string; porto?: string }> }) {
  const sp = await searchParams;
  const { appBase } = await contestoSito();
  const { schede, tipi, porti } = await catalogoPubblico({ tipo: sp.tipo, porto: sp.porto });

  return (
    <div className="bg-white text-ink">
      <IntestazioneSito appBase={appBase} />

      <section className="bg-deep text-white">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <h1 className="font-display text-4xl font-extrabold">Noleggia una barca</h1>
          <p className="mt-3 max-w-2xl text-white/85">Scegli, richiedi, salpa. Barche pubblicate con prezzi di partenza in chiaro, senza patente o con skipper.</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-10">
        <div className="grid gap-4 md:grid-cols-3">
          {PASSI.map((p) => (
            <div key={p.n} className="card p-5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-foam font-display font-extrabold text-ocean">{p.n}</span>
              <h2 className="mt-3 font-display text-lg font-bold text-deep">{p.t}</h2>
              <p className="mt-1 text-sm text-muted">{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-10">
        <h2 className="font-display text-2xl font-extrabold text-deep">Le barche disponibili</h2>
        {(tipi.length > 0 || porti.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <a className={"rounded-full border px-3 py-1 font-semibold " + (!sp.tipo && !sp.porto ? "border-ocean bg-foam text-deep" : "border-line bg-white text-muted")} href="/noleggia">Tutte</a>
            {tipi.map((t) => <a key={t} className={"rounded-full border px-3 py-1 font-semibold " + (sp.tipo === t ? "border-ocean bg-foam text-deep" : "border-line bg-white text-muted")} href={`/noleggia?tipo=${encodeURIComponent(t)}`}>{t}</a>)}
            {porti.map((p) => <a key={p} className={"rounded-full border px-3 py-1 font-semibold " + (sp.porto === p ? "border-ocean bg-foam text-deep" : "border-line bg-white text-muted")} href={`/noleggia?porto=${encodeURIComponent(p)}`}>📍 {p}</a>)}
          </div>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {schede.map((b) => (
            <a key={b.id} href={`/barca/${b.slug ?? b.id}`} className="card overflow-hidden transition hover:shadow-md">
              <div className="h-40 bg-sand">
                {b.fotoCopertina && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.fotoCopertina} alt={b.nome} className="h-full w-full object-cover" loading="lazy" />
                )}
              </div>
              <div className="p-4">
                <h3 className="font-display text-lg font-bold text-deep">{b.nome}</h3>
                <p className="mt-1 text-xs text-muted">{b.tipo ?? "Barca"} · {b.capienza} persone · {b.porto ?? "base da definire"}</p>
                <p className="mt-1 text-xs text-muted">{b.patenteRichiesta ? "Serve patente" : "Senza patente"}{b.voto > 0 ? ` · ★ ${b.voto.toFixed(1)}` : ""}</p>
                <p className="mt-2 font-display text-lg font-extrabold text-ocean">{b.prezzoDaCent != null ? `da ${euro(b.prezzoDaCent)}` : "Su richiesta"}</p>
              </div>
            </a>
          ))}
          {schede.length === 0 && <p className="text-sm text-muted">Nessuna barca pubblicata con questo filtro.</p>}
        </div>
        <p className="mt-4 text-xs text-muted">Le barche le pubblica ogni azienda dalla propria flotta su NaBoat. Se non vedi la barca giusta, <a className="font-bold text-ocean" href="/contatti">scrivici</a>.</p>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-12">
        <h2 className="text-center font-display text-3xl font-extrabold text-deep">Domande frequenti</h2>
        <div className="mt-6 grid gap-2">
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
