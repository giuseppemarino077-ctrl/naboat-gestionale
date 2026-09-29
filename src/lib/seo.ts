import type { Metadata } from "next";
import { headers } from "next/headers";
import type { SeoTipo } from "@prisma/client";
import { prisma } from "@/lib/db";

// SEO delle pagine pubbliche (profilo azienda, schede barche, skipper) per il marketplace.
// Il gestionale resta sempre noindex: qui si preparano solo i contenuti che Google potrà trovare.
// Regola: i campi "Auto" sono generati dai dati reali; i campi manuali li sovrascrivono.

export function slugify(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function tronca(testo: string, max: number): string {
  const pulito = testo.replace(/\s+/g, " ").trim();
  return pulito.length <= max ? pulito : `${pulito.slice(0, max - 1).trimEnd()}…`;
}

export type Generato = { titolo: string; descrizione: string; keywords: string };

const ZONE_DEFAULT = "Italia";

function paroleComuni(localita: string, extra: string[] = []): string[] {
  return [
    "noleggio barca",
    "affitto barca",
    "noleggio imbarcazione",
    "giornata in barca",
    localita ? `noleggio barca ${localita}` : "",
    localita ? `affitto barca ${localita}` : "",
    ...extra,
  ].filter(Boolean);
}

// --- Generazione automatica ---

export function generaPiattaforma(s: { seoTitoloDefault: string | null; seoDescrizioneDefault: string | null; seoKeywordsDefault: string | null; seoLocalitaDefault: string | null }): Generato {
  const localita = s.seoLocalitaDefault || ZONE_DEFAULT;
  return {
    titolo: s.seoTitoloDefault || "NaBoat — Noleggio barche e gestione per i noleggiatori",
    descrizione: s.seoDescrizioneDefault || tronca(`Trova e prenota barche e gommoni con skipper o senza patente. Gestione completa per i noleggiatori: calendario, prenotazioni, incassi.`, 160),
    keywords: s.seoKeywordsDefault || paroleComuni(localita, ["prenotazione barca online", "gestionale noleggio barche"]).join(", "),
  };
}

export function generaAzienda(t: {
  nome: string;
  indirizzoPartenza: string | null;
  barche: { nome: string; tipo: string | null; capienza: number; patenteRichiesta: boolean }[];
}): Generato {
  const localita = t.indirizzoPartenza || ZONE_DEFAULT;
  const senzaPatente = t.barche.some((b) => !b.patenteRichiesta);
  const capienzaMax = t.barche.length ? Math.max(...t.barche.map((b) => b.capienza)) : 0;
  const tipi = [...new Set(t.barche.map((b) => b.tipo).filter(Boolean))] as string[];

  const titolo = tronca(`${t.nome} — Noleggio barche a ${localita}`, 60);
  const descrizione = tronca(
    `${t.nome} noleggia ${t.barche.length} imbarcazioni a ${localita}` +
      (tipi.length ? ` (${tipi.join(", ")})` : "") +
      (capienzaMax ? `, fino a ${capienzaMax} persone` : "") +
      (senzaPatente ? ", anche senza patente" : "") +
      ". Prenota la tua giornata in mare.",
    160
  );
  const keywords = paroleComuni(localita, [
    t.nome.toLowerCase(),
    ...tipi.map((x) => `noleggio ${x} ${localita}`),
    senzaPatente ? `noleggio senza patente ${localita}` : "noleggio con skipper",
  ]);

  return { titolo, descrizione, keywords: [...new Set(keywords)].join(", ") };
}

export function generaBarca(
  b: { nome: string; tipo: string | null; capienza: number; potenzaCv: number | null; patenteRichiesta: boolean },
  azienda: string,
  localita?: string | null
): Generato {
  const zona = localita || ZONE_DEFAULT;
  const dotazioni = [
    b.patenteRichiesta ? "richiede patente nautica" : "senza patente",
    b.potenzaCv ? `${b.potenzaCv} CV` : "",
    `fino a ${b.capienza} persone`,
  ].filter(Boolean);

  const titolo = tronca(`${b.nome} in affitto a ${zona} — ${b.tipo ?? "imbarcazione"}`, 60);
  const descrizione = tronca(
    `Noleggia ${b.nome}${b.tipo ? ` (${b.tipo})` : ""} a ${zona}: ${dotazioni.join(", ")}. Disponibilità e prenotazione online con ${azienda}.`,
    160
  );
  const keywords = paroleComuni(zona, [
    b.nome.toLowerCase(),
    b.tipo ? `noleggio ${b.tipo.toLowerCase()} ${zona}` : "",
    b.patenteRichiesta ? `noleggio con skipper ${zona}` : `noleggio senza patente ${zona}`,
    `${b.capienza} posti`,
    azienda.toLowerCase(),
  ]);

  return { titolo, descrizione, keywords: [...new Set(keywords)].join(", ") };
}

export function generaSkipper(s: { nome: string; qualifica?: string | null }, azienda: string, localita?: string | null): Generato {
  const zona = localita || ZONE_DEFAULT;
  const titolo = tronca(`${s.nome} — Skipper a ${zona}`, 60);
  const descrizione = tronca(
    `${s.nome}, skipper professionista a ${zona}${s.qualifica ? ` (${s.qualifica})` : ""}. Uscite in mare con equipaggio tramite ${azienda}.`,
    160
  );
  const keywords = paroleComuni(zona, ["skipper", `skipper ${zona}`, "noleggio con skipper", s.nome.toLowerCase(), azienda.toLowerCase()]);
  return { titolo, descrizione, keywords: [...new Set(keywords)].join(", ") };
}

// --- Unione generato + manuale ---

export type PaginaSeo = {
  tipo: string;
  refId: string | null;
  slug: string | null;
  pubblica: boolean;
  noindex: boolean;
  titoloAuto: string | null;
  descrizioneAuto: string | null;
  keywordsAuto: string | null;
  titolo: string | null;
  descrizione: string | null;
  keywords: string | null;
  immagine: string | null;
};

export function effettivo(p: PaginaSeo) {
  return {
    titolo: p.titolo ?? p.titoloAuto ?? "",
    descrizione: p.descrizione ?? p.descrizioneAuto ?? "",
    keywords: p.keywords ?? p.keywordsAuto ?? "",
    immagine: p.immagine ?? null,
    slug: p.slug,
    pubblica: p.pubblica,
    noindex: p.noindex,
    manuale: { titolo: !!p.titolo, descrizione: !!p.descrizione, keywords: !!p.keywords },
  };
}

// --- Indicizzabilità e metadati delle schede pubbliche ---
// Un'unica fonte per capire se una pagina va indicizzata: interruttore globale
// (seoPubblicheAttive) + pagina SEO pubblicata da NaBoat + entità ancora idonea.
// L'idoneità dell'entità la garantiscono barcaPerSlug/aziendaPerSlug (FILTRO_CATALOGO).

const CAMPI_SEO = {
  tipo: true,
  refId: true,
  slug: true,
  pubblica: true,
  noindex: true,
  titoloAuto: true,
  descrizioneAuto: true,
  keywordsAuto: true,
  titolo: true,
  descrizione: true,
  keywords: true,
  immagine: true,
} as const;

export type AmbienteSeo = { attive: boolean; base: string };

// Legge l'interruttore globale e l'indirizzo canonico. Senza seoDominioPubblico
// si ricade sull'indirizzo della richiesta, così canonical e og:url restano assoluti.
export async function ambienteSeo(): Promise<AmbienteSeo> {
  const [s, h] = await Promise.all([
    prisma.platformSettings
      .findUnique({ where: { id: "singleton" }, select: { seoPubblicheAttive: true, seoDominioPubblico: true } })
      .catch(() => null),
    headers(),
  ]);
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = (s?.seoDominioPubblico || "").replace(/\/$/, "") || (host ? `${proto}://${host}` : "");
  return { attive: s?.seoPubblicheAttive === true, base };
}

// Pagina SEO di un'entità (la slug attuale è l'indirizzo canonico).
export async function paginaSeoEntita(tipo: SeoTipo, refId: string) {
  return prisma.seoPage.findFirst({ where: { tipo, refId }, select: CAMPI_SEO });
}

// Pagina SEO per slug attuale oppure per uno slug precedente (link non rotti).
export async function trovaPaginaSeo(tipo: SeoTipo, slug: string) {
  return prisma.seoPage.findFirst({
    where: { tipo, OR: [{ slug }, { slugPrecedenti: { has: slug } }] },
    select: CAMPI_SEO,
  });
}

// Slug canonico di un'entità, se NaBoat le ha assegnato una pagina pubblica.
export async function slugCanonico(tipo: SeoTipo, refId: string): Promise<string | null> {
  const p = await prisma.seoPage.findFirst({ where: { tipo, refId }, select: { slug: true } });
  return p?.slug ?? null;
}

function taglio(testo: string, max: number): string {
  return testo.length <= max ? testo : `${testo.slice(0, max - 1).trimEnd()}…`;
}

// Metadati di una scheda pubblica: titolo/descrizione effettivi (override manuali +
// testo generato), canonical coerente con lo slug, openGraph completo e robots
// index solo se la pagina è pubblicata e l'interruttore globale è acceso.
export function metadataEntita(opts: {
  ambiente: AmbienteSeo;
  pagina: PaginaSeo | null;
  percorso: string;
  slug: string;
  fallback: { titolo: string; descrizione: string; immagine?: string | null };
}): Metadata {
  const { ambiente, pagina } = opts;
  const eff = pagina ? effettivo(pagina) : null;
  const titolo = taglio(eff?.titolo || opts.fallback.titolo || "NaBoat", 120);
  const descrizione = taglio(eff?.descrizione || opts.fallback.descrizione || "Noleggio barche con NaBoat.", 300);
  const immagine = eff?.immagine || opts.fallback.immagine || null;
  const indicizzabile = ambiente.attive && !!pagina?.pubblica && !pagina?.noindex;
  const url = ambiente.base ? `${ambiente.base}/${opts.percorso}/${opts.slug}` : undefined;

  return {
    title: titolo,
    description: descrizione,
    alternates: url ? { canonical: url } : undefined,
    robots: indicizzabile ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title: titolo,
      description: descrizione,
      siteName: "NaBoat",
      type: "website",
      ...(url ? { url } : {}),
      ...(immagine ? { images: [immagine] } : {}),
    },
  };
}

// --- Salvataggio e rigenerazione ---

export async function salvaPagina(tipo: SeoTipo, refId: string | null, tenantId: string | null, gen: Generato, slug?: string | null) {
  const dati = {
    titoloAuto: gen.titolo,
    descrizioneAuto: gen.descrizione,
    keywordsAuto: gen.keywords,
    ...(slug !== undefined ? { slug } : {}),
  };

  // La pagina della piattaforma non ha un riferimento: si gestisce a parte
  // (in Postgres i valori nulli non entrano nei vincoli di unicità).
  if (refId === null) {
    const esistente = await prisma.seoPage.findFirst({ where: { tipo }, select: { id: true } });
    if (esistente) return prisma.seoPage.update({ where: { id: esistente.id }, data: dati });
    return prisma.seoPage.create({ data: { tipo, refId: null, tenantId, ...dati } });
  }

  return prisma.seoPage.upsert({
    where: { tipo_refId: { tipo, refId } },
    update: dati,
    create: { tipo, refId, tenantId, ...dati },
  });
}

// Slug unico: se è già usato da un'altra pagina, aggiunge un numero.
async function slugUnico(base: string, escludiId?: string): Promise<string> {
  const pulito = slugify(base) || "pagina";
  let candidato = pulito;
  for (let i = 2; i < 50; i++) {
    const esistente = await prisma.seoPage.findUnique({ where: { slug: candidato }, select: { id: true } });
    if (!esistente || esistente.id === escludiId) return candidato;
    candidato = `${pulito}-${i}`;
  }
  return `${pulito}-${Date.now()}`;
}

export async function rigeneraAzienda(tenantId: string) {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      nome: true,
      indirizzoPartenza: true,
      boats: { select: { nome: true, tipo: true, capienza: true, patenteRichiesta: true } },
    },
  });
  if (!t) return null;
  const esistente = await prisma.seoPage.findUnique({ where: { tipo_refId: { tipo: "azienda", refId: t.id } }, select: { id: true, slug: true } });
  const slug = esistente?.slug ?? (await slugUnico(t.nome));
  return salvaPagina("azienda", t.id, t.id, generaAzienda({ nome: t.nome, indirizzoPartenza: t.indirizzoPartenza, barche: t.boats }), slug);
}

export async function rigeneraBarca(boatId: string) {
  const b = await prisma.boat.findUnique({
    where: { id: boatId },
    select: {
      id: true,
      tenantId: true,
      nome: true,
      tipo: true,
      capienza: true,
      potenzaCv: true,
      patenteRichiesta: true,
      tenant: { select: { nome: true, indirizzoPartenza: true } },
    },
  });
  if (!b) return null;
  const esistente = await prisma.seoPage.findUnique({ where: { tipo_refId: { tipo: "barca", refId: b.id } }, select: { id: true, slug: true } });
  const slug = esistente?.slug ?? (await slugUnico(`${b.nome}-${b.tenant.nome}`));
  return salvaPagina("barca", b.id, b.tenantId, generaBarca(b, b.tenant.nome, b.tenant.indirizzoPartenza), slug);
}

export async function rigeneraSkipper(skipperId: string) {
  const s = await prisma.skipper.findUnique({
    where: { id: skipperId },
    select: { id: true, tenantId: true, nome: true, tenant: { select: { nome: true, indirizzoPartenza: true } } },
  });
  if (!s) return null;
  const esistente = await prisma.seoPage.findUnique({ where: { tipo_refId: { tipo: "skipper", refId: s.id } }, select: { id: true, slug: true } });
  const slug = esistente?.slug ?? (await slugUnico(`${s.nome}-skipper-${s.tenant.nome}`));
  return salvaPagina("skipper", s.id, s.tenantId, generaSkipper(s, s.tenant.nome, s.tenant.indirizzoPartenza), slug);
}

export async function rigeneraTutto() {
  const [te, ba, sk, impostazioni] = await Promise.all([
    prisma.tenant.findMany({ where: { status: "active" }, select: { id: true } }),
    prisma.boat.findMany({ select: { id: true } }),
    prisma.skipper.findMany({ select: { id: true } }),
    prisma.platformSettings.findUnique({ where: { id: "singleton" } }),
  ]);

  await salvaPagina("piattaforma", null, null, generaPiattaforma({
    seoTitoloDefault: impostazioni?.seoTitoloDefault ?? null,
    seoDescrizioneDefault: impostazioni?.seoDescrizioneDefault ?? null,
    seoKeywordsDefault: impostazioni?.seoKeywordsDefault ?? null,
    seoLocalitaDefault: impostazioni?.seoLocalitaDefault ?? null,
  }));

  for (const t of te) await rigeneraAzienda(t.id);
  for (const b of ba) await rigeneraBarca(b.id);
  for (const s of sk) await rigeneraSkipper(s.id);

  return { piattaforma: 1, aziende: te.length, barche: ba.length, skipper: sk.length };
}
