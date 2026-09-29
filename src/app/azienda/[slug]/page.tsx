import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IntestazioneSito } from "@/components/sito/IntestazioneSito";
import { PiedeSito } from "@/components/sito/PiedeSito";
import { prisma } from "@/lib/db";
import { aziendaPerSlug } from "@/lib/marketplace";
import { contestoSito } from "@/lib/sito-server";

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = await aziendaPerSlug(slug);
  if (!a) return { title: "Azienda non trovata" };
  return {
    title: `${a.nome}${a.citta ? ` — noleggio barche a ${a.citta}` : ""} | NaBoat`,
    description: a.descrizione?.slice(0, 155) ?? `Le barche di ${a.nome} su NaBoat: prezzi, disponibilità e contatti.`,
    robots: { index: true, follow: true },
  };
}

export default async function AziendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tipo?: string; porto?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const a = await aziendaPerSlug(slug);
  if (!a) notFound();
  const { appBase } = await contestoSito();

  const pagine = await prisma.seoPage.findMany({ where: { tipo: "barca", refId: { in: a.boats.map((b) => b.id) } }, select: { refId: true, slug: true } });
  const slugBarca = new Map(pagine.map((p) => [p.refId as string, p.slug as string]));

  // Recensioni pubblicate: visibili solo se la visibilità è accesa. Non si mostra
  // il nome del cliente, solo voto, commento e risposta dell'azienda.
  const recensioni = a.mostraRecensioni
    ? await prisma.recensione.findMany({
        where: { tenantId: a.id, stato: "pubblicata" },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: { id: true, voto: true, commento: true, risposta: true, createdAt: true },
      })
    : [];

  const tipi = Array.from(new Set(a.boats.map((b) => b.tipo).filter(Boolean))) as string[];
  const portiNomi = Array.from(new Set(a.boats.map((b) => b.porto?.nome).filter(Boolean))) as string[];
  const filtrate = a.boats.filter((b) => (!sp.tipo || b.tipo === sp.tipo) && (!sp.porto || b.porto?.nome === sp.porto));

  const tel = a.telefonoContatto?.replace(/\D/g, "");
  const wa = tel ? `https://wa.me/${tel}?text=${encodeURIComponent(`Salve, ho visto ${a.nome} su NaBoat e vorrei informazioni.`)}` : null;
  const copertina = a.copertinaUrl ?? a.boats.find((b) => b.fotoCopertina)?.fotoCopertina ?? a.logoUrl;

  return (
    <div className="bg-white text-ink">
      <IntestazioneSito appBase={appBase} />

      <div className="relative isolate overflow-hidden bg-deep">
        {copertina && <div className="absolute inset-0 bg-cover bg-center opacity-60" style={{ backgroundImage: `url(${copertina})` }} aria-hidden />}
        <div className="absolute inset-0 bg-gradient-to-t from-[#2a1408]/90 to-[#2a1408]/40" aria-hidden />
        <div className="relative mx-auto flex max-w-5xl flex-col items-start gap-4 px-5 py-12 text-white md:flex-row md:items-end">
          <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-white bg-white">
            {a.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.logoUrl} alt="" className="h-full w-full object-contain p-1" />
            ) : (
              <span className="font-display text-2xl font-extrabold text-deep">{a.nome.charAt(0)}</span>
            )}
          </span>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 font-display text-3xl font-extrabold">
              {a.nome}
              {a.verificata && <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-[#3a2708]">✓ verificata</span>}
            </h1>
            <p className="mt-1 text-sm text-white/85">
              {a.citta ?? a.indirizzoPartenza ?? ""}{a.annoFondazione ? ` · dal ${a.annoFondazione}` : ""}
            </p>
            {wa && <a className="mt-3 inline-block rounded-[7px] bg-gold px-4 py-2 text-sm font-extrabold text-[#3a2708]" href={wa} target="_blank" rel="noreferrer">Contatta su WhatsApp</a>}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-5 py-8">
        {a.mostraChiSiamo && a.descrizione && (
          <section className="mb-8">
            <h2 className="font-display text-2xl font-extrabold text-deep">Chi siamo</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-muted">{a.descrizione}</p>
          </section>
        )}

        <section>
          <h2 className="font-display text-2xl font-extrabold text-deep">Le barche</h2>
          {(tipi.length > 0 || portiNomi.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <a className={"rounded-full border px-3 py-1 font-semibold " + (!sp.tipo ? "border-ocean bg-foam text-deep" : "border-line bg-white text-muted")} href={`/azienda/${slug}`}>Tutte</a>
              {tipi.map((t) => <a key={t} className={"rounded-full border px-3 py-1 font-semibold " + (sp.tipo === t ? "border-ocean bg-foam text-deep" : "border-line bg-white text-muted")} href={`/azienda/${slug}?tipo=${encodeURIComponent(t)}`}>{t}</a>)}
              {portiNomi.map((p) => <a key={p} className={"rounded-full border px-3 py-1 font-semibold " + (sp.porto === p ? "border-ocean bg-foam text-deep" : "border-line bg-white text-muted")} href={`/azienda/${slug}?porto=${encodeURIComponent(p)}`}>📍 {p}</a>)}
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtrate.map((b) => (
              <a key={b.id} href={`/barca/${slugBarca.get(b.id) ?? b.id}`} className="card overflow-hidden transition hover:shadow-md">
                <div className="h-40 bg-sand">
                  {b.fotoCopertina && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.fotoCopertina} alt={b.nome} className="h-full w-full object-cover" loading="lazy" />
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-lg font-bold text-deep">{b.nome}</h3>
                    {b.voto > 0 && <span className="shrink-0 text-xs text-muted">★ {b.voto.toFixed(1)}</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {b.tipo ?? "Barca"} · {b.capienza} persone{b.lunghezzaM != null ? ` · ${b.lunghezzaM} m` : ""}
                    {b.cabine != null ? ` · ${b.cabine} cabine` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {b.patenteRichiesta ? "Serve patente" : "Senza patente"} · {b.porto?.nome ?? "base da definire"}
                  </p>
                  <p className="mt-2 font-display text-lg font-extrabold text-ocean">{b.prezzoDaCent != null ? `da ${euro(b.prezzoDaCent)}` : "Su richiesta"}</p>
                </div>
              </a>
            ))}
            {filtrate.length === 0 && <p className="text-sm text-muted">Nessuna barca pubblicata con questo filtro.</p>}
          </div>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="card p-5 text-sm">
            <h3 className="font-display text-lg font-bold text-deep">Informazioni</h3>
            <ul className="mt-2 grid gap-1 text-muted">
              {a.lingue && <li>Lingue parlate: {a.lingue}</li>}
              {(a.orarioImbarco || a.orarioRientro) && <li>Orari di imbarco/rientro: {a.orarioImbarco ?? "—"} / {a.orarioRientro ?? "—"}</li>}
              {a.politicaCancellazione && <li>Cancellazione: {a.politicaCancellazione}</li>}
            </ul>
          </div>
          <div className="card p-5 text-sm">
            <h3 className="font-display text-lg font-bold text-deep">Contatti</h3>
            <ul className="mt-2 grid gap-1 text-muted">
              {a.mostraTelefono && a.telefonoContatto && <li>Telefono: <a className="font-bold text-ocean" href={`tel:${tel}`}>{a.telefonoContatto}</a></li>}
              {a.mostraEmail && <li><a className="font-bold text-ocean" href="/contatti">Scrivi dall'apposito modulo</a></li>}
              {a.mostraSocial && a.sito && <li><a className="font-bold text-ocean" href={a.sito} target="_blank" rel="noreferrer">Sito web</a></li>}
              {a.mostraSocial && a.social && <li><a className="font-bold text-ocean" href={a.social} target="_blank" rel="noreferrer">Social</a></li>}
            </ul>
          </div>
        </section>

        {recensioni.length > 0 && (
          <section className="mt-8">
            <h2 className="font-display text-2xl font-extrabold text-deep">Recensioni</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {recensioni.map((r) => (
                <div key={r.id} className="card p-4 text-sm">
                  <p className="font-bold text-gold">
                    {"★".repeat(Math.max(1, Math.min(5, r.voto)))} <span className="text-muted">{r.voto}/5</span>
                  </p>
                  {r.commento && <p className="mt-1 whitespace-pre-line text-muted">{r.commento}</p>}
                  {r.risposta && <p className="mt-2 rounded-2xl bg-foam p-2 text-xs"><b>Risposta dell&apos;azienda:</b> {r.risposta}</p>}
                  <p className="mt-1 text-xs text-muted">{r.createdAt.toLocaleDateString("it-IT")}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {a.mostraPorti && a.porti.length > 0 && (
          <section className="mt-8">
            <h2 className="font-display text-2xl font-extrabold text-deep">Porti operativi</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {a.porti.map((p) => (
                <div key={p.id} className="card p-4 text-sm">
                  <p className="font-bold text-deep">{p.nome}</p>
                  {p.indirizzo && <p className="text-muted">{p.indirizzo}</p>}
                  {p.note && <p className="text-xs text-muted">{p.note}</p>}
                  {p.lat != null && p.lon != null && (
                    <a className="mt-1 inline-block font-bold text-ocean" href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`} target="_blank" rel="noreferrer">Apri nelle mappe</a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <PiedeSito appBase={appBase} />
    </div>
  );
}
