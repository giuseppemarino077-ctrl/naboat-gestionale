import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { IntestazioneSito } from "@/components/sito/IntestazioneSito";
import { PiedeSito } from "@/components/sito/PiedeSito";
import { RichiestaForm } from "@/components/sito/RichiestaForm";
import { barcaPerSlug, sceglieTariffa, stagioneDi, TIPI_TARIFFA } from "@/lib/marketplace";
import { ambienteSeo, metadataEntita, paginaSeoEntita, slugCanonico, trovaPaginaSeo } from "@/lib/seo";
import { contestoSito } from "@/lib/sito-server";

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

const ETICHETTA_TIPO: Record<string, string> = { mezza_giornata: "Mezza giornata", giornata: "Giornata", settimana: "Settimana" };

// Slug canonico della barca: pagina SEO pubblica, altrimenti l'id (schede non indicizzate).
async function risolviBarca(slug: string) {
  const pagina = (await trovaPaginaSeo("barca", slug)) ?? (await paginaSeoEntita("barca", slug));
  return { pagina, slugEffettivo: pagina?.slug ?? slug };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { pagina, slugEffettivo } = await risolviBarca(slug);
  const b = await barcaPerSlug(slugEffettivo);
  if (!b) return { title: "Barca non trovata", robots: { index: false, follow: false } };
  const ambiente = await ambienteSeo();
  return metadataEntita({
    ambiente,
    pagina,
    percorso: "barca",
    slug: slugEffettivo,
    fallback: {
      titolo: `${b.nome}${b.porto ? ` — ${b.porto.nome}` : ""} | NaBoat`,
      descrizione: b.descrizione?.slice(0, 155) ?? `Noleggia ${b.nome} a ${b.porto?.nome ?? "Napoli"} con ${b.tenant.nome}.`,
      immagine: b.fotoCopertina,
    },
  });
}

export default async function BarcaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { pagina, slugEffettivo } = await risolviBarca(slug);
  // Indirizzo sempre canonico: id o slug precedente vengono reindirizzati (link non rotti).
  if (pagina?.slug && pagina.slug !== slug) redirect(`/barca/${pagina.slug}`);
  const b = await barcaPerSlug(slugEffettivo);
  if (!b) notFound();
  const { appBase } = await contestoSito();

  const foto = b.fotoCopertina ? [b.fotoCopertina, ...b.fotoGallery.filter((f) => f !== b.fotoCopertina)] : b.fotoGallery;
  const prezzoDa = b.tariffe.length ? Math.min(...b.tariffe.map((t) => t.prezzoCent)) : null;
  // Listino per la stagione corrente: stessa precedenza unica del preventivo (M03).
  const stagione = stagioneDi(new Date());
  const listino = TIPI_TARIFFA.map((tipo) => ({ tipo, scelta: sceglieTariffa(b.tariffe, b.id, tipo, stagione) })).filter((x) => x.scelta);
  const tel = b.tenant.telefonoContatto?.replace(/\D/g, "");
  const wa = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(`Salve, sono interessato alla barca ${b.nome}${b.porto ? ` (${b.porto.nome})` : ""}.`)}` : null;
  // Collegamento all'azienda sullo slug canonico, non su quello del profilo azienda.
  const aziendaSlug = (await slugCanonico("azienda", b.tenantId)) ?? b.tenant.slug ?? b.tenant.id;

  const patenteBox = b.patenteRichiesta
    ? { testo: "Serve la patente nautica", classe: "border-[#fdba74] bg-[#ffe8d5] text-deep" }
    : { testo: "Si noleggia senza patente", classe: "border-[#a9e0d0] bg-[#d8f3ea] text-[#177469]" };

  return (
    <div className="bg-white text-ink">
      <IntestazioneSito appBase={appBase} />

      <div className="mx-auto max-w-5xl px-5 py-8 pb-24 md:pb-8">
        <p className="text-sm text-muted">
          <a className="font-bold text-ocean" href="/">NaBoat</a>
          {" · "}
          <a className="font-bold text-ocean" href={`/azienda/${aziendaSlug}`}>{b.tenant.nome}</a>
          {b.porto ? ` · ${b.porto.nome}` : ""}
        </p>

        <h1 className="mt-1 font-display text-3xl font-extrabold text-deep">{b.nome}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
          {b.voto > 0 && <span>★ {b.voto.toFixed(1)} ({b.recensioni})</span>}
          <span>{b.tipo ?? "Imbarcazione"}</span>
          {b.capienza != null && <span>Fino a {b.capienza} persone</span>}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[2fr_1fr]">
          <div className="overflow-hidden rounded-[18px] border border-line bg-sand">
            {foto[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={foto[0]} alt={b.nome} className="h-[280px] w-full object-cover md:h-[420px]" loading="eager" />
            ) : (
              <div className="grid h-[280px] place-items-center text-muted md:h-[420px]">Nessuna foto</div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-1">
            {foto.slice(1, 4).map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f} src={f} alt={b.nome} className="h-20 w-full rounded-[14px] border border-line object-cover md:h-[136px]" loading="lazy" />
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-[1.6fr_1fr]">
          <div className="grid gap-6">
            <div className={`rounded-[14px] border px-4 py-3 text-sm font-semibold ${patenteBox.classe}`}>{patenteBox.testo}</div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="card p-3"><p className="text-xs text-muted">Persone</p><p className="font-bold">{b.capienza ?? "Da definire"}</p></div>
              <div className="card p-3"><p className="text-xs text-muted">Lunghezza</p><p className="font-bold">{b.lunghezzaM != null ? `${b.lunghezzaM} m` : "—"}</p></div>
              <div className="card p-3"><p className="text-xs text-muted">Motore</p><p className="font-bold">{b.potenzaCv != null ? `${b.potenzaCv} CV` : "—"}</p></div>
              <div className="card p-3"><p className="text-xs text-muted">Cabine</p><p className="font-bold">{b.cabine ?? "—"}</p></div>
            </div>

            {listino.length > 0 && (
              <div className="card p-4">
                <h2 className="font-display text-lg font-bold text-deep">Prezzi ({stagione} stagione)</h2>
                <ul className="mt-2 grid gap-1 text-sm">
                  {listino.map((x) => (
                    <li key={x.tipo} className="flex justify-between border-b border-line py-1 last:border-0">
                      <span>{ETICHETTA_TIPO[x.tipo] ?? x.tipo}</span>
                      <span className="font-semibold">{euro(x.scelta!.prezzoCent)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted">Prezzo del noleggio; extra e commissioni sono indicati nella richiesta.</p>
              </div>
            )}
            {listino.length === 0 && (
              <div className="rounded-[14px] border border-line px-4 py-3 text-sm text-muted">Preventivo da definire: chiedi all&apos;azienda il prezzo per le tue date.</div>
            )}

            {b.descrizione && <p className="whitespace-pre-line text-sm text-muted">{b.descrizione}</p>}

            {b.dotazioni.length > 0 && (
              <div>
                <h2 className="font-display text-lg font-bold text-deep">Dotazioni</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {b.dotazioni.map((d) => <span key={d} className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold">{d}</span>)}
                </div>
              </div>
            )}

            {b.extras.length > 0 && (
              <div>
                <h2 className="font-display text-lg font-bold text-deep">Servizi extra</h2>
                <ul className="mt-2 grid gap-1 text-sm">
                  {b.extras.map((e) => (
                    <li key={e.id} className="flex justify-between border-b border-line py-1">
                      <span>{e.nome}</span><span className="font-semibold">{e.prezzo != null ? euro(Math.round(e.prezzo * 100)) : "—"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <details className="card p-4">
              <summary className="cursor-pointer font-semibold text-deep">Scheda tecnica e regole</summary>
              <ul className="mt-2 grid gap-1 text-sm text-muted">
                {b.modello && <li>Modello: {b.modello.marca ?? ""} {b.modello.modello}</li>}
                <li>Carburante: {b.carburante ?? "da definire in banchina"}</li>
                <li>Cauzione: {b.cauzioneCent != null ? euro(b.cauzioneCent) : "secondo condizioni dell'azienda"}</li>
                <li>Età minima: {b.etaMinima != null ? `${b.etaMinima} anni` : "secondo condizioni dell'azienda"}</li>
                <li>Orari di imbarco/rientro: {b.tenant.orarioImbarco ?? "—"} / {b.tenant.orarioRientro ?? "—"}</li>
                <li>Cancellazione: {b.tenant.politicaCancellazione ?? "secondo condizioni dell'azienda"}</li>
              </ul>
            </details>
          </div>

          <aside className="grid h-fit gap-3 rounded-[18px] border border-line bg-white p-5 shadow-sm md:sticky md:top-20">
            <div>
              <p className="text-xs text-muted">Prezzo di partenza</p>
              <p className="font-display text-3xl font-extrabold text-deep">{prezzoDa != null ? euro(prezzoDa) : "Su richiesta"}</p>
            </div>
            <p className="text-sm text-muted">Base di partenza: <b className="text-ink">{b.porto?.nome ?? b.tenant.indirizzoPartenza ?? "da definire"}</b></p>
            {b.porto?.indirizzo && <p className="text-xs text-muted">{b.porto.indirizzo}</p>}
            {b.porto?.note && <p className="text-xs text-muted">{b.porto.note}</p>}
            {b.porto?.lat != null && b.porto?.lon != null && (
              <a className="text-sm font-bold text-ocean" href={`https://www.google.com/maps/search/?api=1&query=${b.porto.lat},${b.porto.lon}`} target="_blank" rel="noreferrer">Apri nelle mappe</a>
            )}
            {b.tenant.mostraTelefono && b.tenant.telefonoContatto && <a className="btn-soft" href={`tel:${tel}`}>☎ {b.tenant.telefonoContatto}</a>}
            {wa && <a className="btn-primary" href={wa} target="_blank" rel="noreferrer">Contatta su WhatsApp</a>}
            {b.tenant.mostraEmail && (
              <a className="btn-soft" href={`/contatti`}>Chiedi informazioni</a>
            )}
            <div className="mt-2 border-t border-line pt-3">
              <p className="font-display font-bold text-deep">Chiedi di prenotare</p>
              <RichiestaForm boatId={b.id} capienza={b.capienza} />
            </div>
          </aside>
        </div>
      </div>

      {/* Barra fissa su telefono */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-2 border-t border-line bg-white px-4 py-3 md:hidden">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Da</p>
          <p className="font-display text-lg font-extrabold text-deep">{prezzoDa != null ? euro(prezzoDa) : "—"}</p>
        </div>
        <a className="btn-primary" href={wa ?? `/contatti`} target={wa ? "_blank" : undefined} rel="noreferrer">Contatta</a>
      </div>

      <PiedeSito appBase={appBase} />
    </div>
  );
}
