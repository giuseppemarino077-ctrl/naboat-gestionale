import type { Metadata } from "next";
import { IntestazioneSito } from "@/components/sito/IntestazioneSito";
import { PiedeSito } from "@/components/sito/PiedeSito";
import { catalogoPubblico } from "@/lib/marketplace";
import { contestoSito } from "@/lib/sito-server";

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const dataBreve = (iso: string) => new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });

export const metadata: Metadata = {
  title: "Noleggia una barca — scegli, richiedi, salpa | NaBoat",
  description:
    "Noleggia una barca a Napoli, Capri, Ischia, Procida e Salerno: filtra per luogo, date e persone, invia la richiesta e salpa.",
  robots: { index: true, follow: true },
};

const PASSI = [
  { n: "1", t: "Scegli", d: "Filtra per luogo, date e persone; affina poi con tipo, skipper e requisiti." },
  { n: "2", t: "Richiedi", d: "Invia la richiesta all'azienda con data e numero di persone: ricevi conferma e regole prima di pagare." },
  { n: "3", t: "Salpa", d: "Ci vediamo in banchina: check-in rapido, contratto digitale e skipper se ti serve." },
];

const DOMANDE = [
  { d: "Serve la patente nautica?", r: "Dipende dalla barca: molte si noleggiano senza patente entro i limiti di legge; le più potenti la richiedono oppure si noleggiano con skipper." },
  { d: "Posso noleggiare con lo skipper?", r: "Sì: nella scheda della barca è indicato se è previsto lo skipper. In quel caso non serve la patente." },
  { d: "Come funziona la richiesta?", r: "Non è una conferma automatica: l'azienda verifica la disponibilità e ti risponde con le condizioni. Le regole le trovi prima di pagare." },
  { d: "La cauzione?", r: "Dove è attiva, la cauzione si blocca sulla carta e si libera al rientro se tutto è in ordine. I dettagli li indica l'azienda." },
];

type Ricerca = { tipo?: string; porto?: string; dal?: string; al?: string; persone?: string; skipper?: string; patente?: string };
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";

export default async function NoleggiaPage({ searchParams }: { searchParams: Promise<Ricerca> }) {
  const sp = await searchParams;
  const { appBase } = await contestoSito();

  const pat = uno(sp.patente);
  const filtri = {
    tipo: uno(sp.tipo) || undefined,
    porto: uno(sp.porto) || undefined,
    dal: uno(sp.dal) || undefined,
    al: uno(sp.al) || undefined,
    persone: uno(sp.persone) ? Number(uno(sp.persone)) : undefined,
    skipper: uno(sp.skipper) === "1" ? true : undefined,
    patente: (pat === "si" || pat === "no" ? pat : undefined) as "si" | "no" | undefined,
  };
  const { schede, tipi, porti, conData } = await catalogoPubblico(filtri);

  // Conserva gli altri filtri quando si cambia un solo valore (pill e link).
  const attivi: Record<string, string> = {};
  if (filtri.tipo) attivi.tipo = filtri.tipo;
  if (filtri.porto) attivi.porto = filtri.porto;
  if (filtri.dal) attivi.dal = filtri.dal;
  if (filtri.al) attivi.al = filtri.al;
  if (filtri.persone) attivi.persone = String(filtri.persone);
  if (filtri.skipper) attivi.skipper = "1";
  if (filtri.patente) attivi.patente = filtri.patente;
  const href = (patch: Record<string, string | undefined>) => {
    const p = { ...attivi, ...patch };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v) qs.set(k, v);
    const s = qs.toString();
    return s ? `/noleggia?${s}` : "/noleggia";
  };

  const campo = "rounded-2xl border border-line p-3 text-sm";

  return (
    <div className="bg-white text-ink">
      <IntestazioneSito appBase={appBase} />

      <section className="bg-deep text-white">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <h1 className="font-display text-4xl font-extrabold">Noleggia una barca</h1>
          <p className="mt-3 max-w-2xl text-white/85">Scegli, richiedi, salpa. Barche pubblicate con prezzi in chiaro, senza patente o con skipper.</p>
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
        <div className="card p-4">
          <form method="get" action="/noleggia" className="grid gap-3 md:grid-cols-4">
            <label className="grid gap-1 text-xs font-semibold text-deep">Luogo
              <select name="porto" defaultValue={filtri.porto ?? ""} className={campo}>
                <option value="">Tutte le basi</option>
                {porti.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-deep">Dal
              <input type="date" name="dal" defaultValue={filtri.dal ?? ""} className={campo} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-deep">Al
              <input type="date" name="al" defaultValue={filtri.al ?? ""} className={campo} />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-deep">Persone
              <input type="number" name="persone" min={1} max={60} defaultValue={filtri.persone ?? ""} className={campo} />
            </label>

            <details className="md:col-span-4">
              <summary className="cursor-pointer text-sm font-bold text-ocean">Filtri avanzati</summary>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="grid gap-1 text-xs font-semibold text-deep">Tipo di barca
                  <select name="tipo" defaultValue={filtri.tipo ?? ""} className={campo}>
                    <option value="">Tutti i tipi</option>
                    {tipi.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-deep">Skipper
                  <select name="skipper" defaultValue={filtri.skipper ? "1" : ""} className={campo}>
                    <option value="">Indifferente</option>
                    <option value="1">Con skipper disponibile</option>
                  </select>
                </label>
                <label className="grid gap-1 text-xs font-semibold text-deep">Requisiti
                  <select name="patente" defaultValue={filtri.patente ?? ""} className={campo}>
                    <option value="">Indifferente</option>
                    <option value="no">Noleggiabile senza patente</option>
                    <option value="si">Serve la patente</option>
                  </select>
                </label>
              </div>
            </details>

            <div className="flex items-center gap-2 md:col-span-4">
              <button type="submit" className="btn-primary">Cerca</button>
              <a className="text-sm font-bold text-ocean" href="/noleggia">Azzera filtri</a>
            </div>
          </form>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-2xl font-extrabold text-deep">
            {conData ? "Barche disponibili" : "Le barche pubblicate"}
          </h2>
          <p className="text-sm text-muted">
            {schede.length} {schede.length === 1 ? "risultato" : "risultati"}
            {conData && filtri.dal ? ` · dal ${dataBreve(filtri.dal)}${filtri.al ? ` al ${dataBreve(filtri.al)}` : ""}` : ""}
          </p>
        </div>

        {!conData && (
          <p className="mt-2 text-xs text-muted">Indica le date per vedere la disponibilità reale e i prezzi per la durata. Senza date mostriamo i prezzi di partenza, non la disponibilità.</p>
        )}

        {(tipi.length > 0 || porti.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <a className={"rounded-full border px-3 py-1 font-semibold " + (!filtri.tipo ? "border-ocean bg-foam text-deep" : "border-line bg-white text-muted")} href={href({ tipo: undefined })}>Tutti i tipi</a>
            {tipi.map((t) => <a key={t} className={"rounded-full border px-3 py-1 font-semibold " + (filtri.tipo === t ? "border-ocean bg-foam text-deep" : "border-line bg-white text-muted")} href={href({ tipo: t })}>{t}</a>)}
            {porti.map((p) => <a key={p} className={"rounded-full border px-3 py-1 font-semibold " + (filtri.porto === p ? "border-ocean bg-foam text-deep" : "border-line bg-white text-muted")} href={href({ porto: filtri.porto === p ? undefined : p })}>📍 {p}</a>)}
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
                <p className="mt-1 text-xs text-muted">
                  {b.patenteRichiesta ? "Serve patente" : "Senza patente"}
                  {b.conSkipper ? " · skipper disponibile" : ""}
                  {b.voto > 0 ? ` · ★ ${b.voto.toFixed(1)}` : ""}
                </p>
                {conData ? (
                  <p className="mt-2 font-display text-lg font-extrabold text-ocean">
                    {b.prezzoPeriodoCent != null
                      ? `${euro(b.prezzoPeriodoCent)} · ${b.prezzoEtichetta}`
                      : <span className="text-sm font-bold text-muted">Preventivo da definire</span>}
                  </p>
                ) : (
                  <p className="mt-2 font-display text-lg font-extrabold text-ocean">{b.prezzoDaCent != null ? `da ${euro(b.prezzoDaCent)}` : "Su richiesta"}</p>
                )}
              </div>
            </a>
          ))}
          {schede.length === 0 && (
            <p className="text-sm text-muted">
              {conData ? "Nessuna barca libera in queste date con i filtri scelti." : "Nessuna barca pubblicata con questo filtro."}
            </p>
          )}
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
