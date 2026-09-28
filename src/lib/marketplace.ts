import { prisma } from "@/lib/db";

// Dati pubblici del marketplace NaBoat. Sono letture server-side senza sessione:
// espongono SOLO ciò che è pubblicato e approvato, mai matricola o dati fiscali.

const AZIENDA_ATTIVA = { tenant: { status: "active" as const } };

export type NumeriPiattaforma = { barche: number; senzaPatente: number; conSkipper: number; localita: number };

// Numeri reali della piattaforma per la home.
export async function numeriPiattaforma(): Promise<NumeriPiattaforma> {
  const [barche, senzaPatente, conSkipper, localita] = await Promise.all([
    prisma.boat.count({ where: { uso: "noleggio", pubblicata: true, inPausa: false, ...AZIENDA_ATTIVA } }),
    prisma.boat.count({ where: { uso: "noleggio", pubblicata: true, inPausa: false, patenteRichiesta: false, ...AZIENDA_ATTIVA } }),
    prisma.booking
      .findMany({
        where: { skipperId: { not: null }, boat: { uso: "noleggio", pubblicata: true, inPausa: false }, ...AZIENDA_ATTIVA },
        select: { boatId: true },
        distinct: ["boatId"],
      })
      .then((r) => r.length),
    prisma.porto.count({ where: AZIENDA_ATTIVA }),
  ]);
  return { barche, senzaPatente, conSkipper, localita };
}

type Valutazione = { voto: number; n: number };

// Media dei voti pubblicati per barca. Le recensioni passano per le prenotazioni concluse.
async function valutazioniPerBarche(boatIds: string[]): Promise<Map<string, Valutazione>> {
  const m = new Map<string, Valutazione>();
  if (!boatIds.length) return m;
  const righe = await prisma.booking.findMany({
    where: { boatId: { in: boatIds }, recensione: { stato: "pubblicata" } },
    select: { boatId: true, recensione: { select: { voto: true } } },
  });
  for (const r of righe) {
    const c = m.get(r.boatId) ?? { voto: 0, n: 0 };
    c.voto += r.recensione?.voto ?? 0;
    c.n += 1;
    m.set(r.boatId, c);
  }
  for (const [k, c] of m) m.set(k, { voto: c.n ? c.voto / c.n : 0, n: c.n });
  return m;
}

async function slugsBarche(boatIds: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!boatIds.length) return m;
  const pagine = await prisma.seoPage.findMany({ where: { tipo: "barca", refId: { in: boatIds } }, select: { refId: true, slug: true } });
  for (const p of pagine) if (p.refId && p.slug) m.set(p.refId, p.slug);
  return m;
}

export type SchedaEvidenza = {
  id: string;
  slug: string | null;
  nome: string;
  tipo: string | null;
  fotoCopertina: string | null;
  patenteRichiesta: boolean;
  capienza: number;
  porto: string | null;
  azienda: string;
  aziendaSlug: string | null;
  prezzoDaCent: number | null;
  voto: number;
  recensioni: number;
};

// Criterio del carosello (documentato, non fornito dalla fonte): punteggio = voto medio × ln(recensioni+1);
// a parità di punteggio si ordina per inserimento più recente. Con zero recensioni il punteggio è 0.
export async function barcheInEvidenza(limite = 6): Promise<SchedaEvidenza[]> {
  const boats = await prisma.boat.findMany({
    where: { uso: "noleggio", pubblicata: true, inPausa: false, tenant: { status: "active" } },
    include: {
      porto: { select: { nome: true } },
      tenant: { select: { nome: true, slug: true } },
      tariffe: { where: { attivo: true }, select: { prezzoCent: true } },
    },
  });
  const ids = boats.map((b) => b.id);
  const [val, slugs] = await Promise.all([valutazioniPerBarche(ids), slugsBarche(ids)]);
  const schede: (SchedaEvidenza & { punteggio: number; creato: number })[] = boats.map((b) => {
    const v = val.get(b.id);
    const voto = v?.voto ?? 0;
    const n = v?.n ?? 0;
    const prezzoDaCent = b.tariffe.length ? Math.min(...b.tariffe.map((t) => t.prezzoCent)) : null;
    return {
      id: b.id,
      slug: slugs.get(b.id) ?? null,
      nome: b.nome,
      tipo: b.tipo,
      fotoCopertina: b.fotoCopertina,
      patenteRichiesta: b.patenteRichiesta,
      capienza: b.capienza,
      porto: b.porto?.nome ?? null,
      azienda: b.tenant.nome,
      aziendaSlug: b.tenant.slug,
      prezzoDaCent,
      voto,
      recensioni: n,
      punteggio: voto * Math.log(n + 1),
      creato: b.createdAt.getTime(),
    };
  });
  schede.sort((a, b) => b.punteggio - a.punteggio || b.creato - a.creato);
  return schede.slice(0, limite).map(({ punteggio: _p, creato: _c, ...rest }) => rest);
}

export type BarcaPubblica = Awaited<ReturnType<typeof barcaPerSlug>>;
// Scheda pubblica di una barca. Lo slug arriva dalla pagina SEO; in mancanza si accetta l'id.
export async function barcaPerSlug(slug: string) {
  const pagina = await prisma.seoPage.findFirst({ where: { slug, tipo: "barca" }, select: { refId: true } });
  const id = pagina?.refId ?? slug;
  const b = await prisma.boat.findFirst({
    where: { id, uso: "noleggio", pubblicata: true, inPausa: false, tenant: { status: "active" } },
    include: {
      porto: true,
      modello: { select: { marca: true, modello: true } },
      tenant: true,
      tariffe: { where: { attivo: true }, orderBy: { prezzoCent: "asc" } },
    },
  });
  if (!b) return null;
  const val = (await valutazioniPerBarche([b.id])).get(b.id) ?? { voto: 0, n: 0 };
  const extras = await prisma.extra.findMany({ where: { tenantId: b.tenantId }, orderBy: { nome: "asc" } });
  return { ...b, voto: val.voto, recensioni: val.n, extras };
}

export type AziendaPubblica = Awaited<ReturnType<typeof aziendaPerSlug>>;

// Profilo pubblico del noleggiatore: slug da pagina SEO oppure dal campo Tenant.slug.
export async function aziendaPerSlug(slug: string) {
  const pagina = await prisma.seoPage.findFirst({ where: { slug, tipo: "azienda" }, select: { refId: true } });
  const t = await prisma.tenant.findFirst({
    where: pagina?.refId
      ? { id: pagina.refId, status: "active" }
      : { OR: [{ slug }, { id: slug }], status: "active" },
    include: {
      porti: { orderBy: { nome: "asc" } },
      boats: {
        where: { uso: "noleggio", pubblicata: true, inPausa: false },
        orderBy: { nome: "asc" },
        include: { porto: { select: { nome: true } }, tariffe: { where: { attivo: true }, select: { prezzoCent: true } } },
      },
    },
  });
  if (!t) return null;
  const ids = t.boats.map((b) => b.id);
  const val = await valutazioniPerBarche(ids);
  const boats = t.boats.map((b) => {
    const v = val.get(b.id);
    return { ...b, voto: v?.voto ?? 0, recensioni: v?.n ?? 0, prezzoDaCent: b.tariffe.length ? Math.min(...b.tariffe.map((x) => x.prezzoCent)) : null };
  });
  return { ...t, boats };
}

export type CatalogoPubblico = {
  schede: SchedaEvidenza[];
  tipi: string[];
  porti: string[];
};

// Catalogo pubblico con i filtri usati dal percorso «Noleggia una barca».
export async function catalogoPubblico(filtri: { tipo?: string; porto?: string } = {}): Promise<CatalogoPubblico> {
  const boats = await prisma.boat.findMany({
    where: { uso: "noleggio", pubblicata: true, inPausa: false, tenant: { status: "active" } },
    include: {
      porto: { select: { nome: true } },
      tenant: { select: { nome: true, slug: true } },
      tariffe: { where: { attivo: true }, select: { prezzoCent: true } },
    },
    orderBy: { nome: "asc" },
  });
  const ids = boats.map((b) => b.id);
  const [val, slugs] = await Promise.all([valutazioniPerBarche(ids), slugsBarche(ids)]);
  const tutte: SchedaEvidenza[] = boats.map((b) => {
    const v = val.get(b.id);
    return {
      id: b.id,
      slug: slugs.get(b.id) ?? null,
      nome: b.nome,
      tipo: b.tipo,
      fotoCopertina: b.fotoCopertina,
      patenteRichiesta: b.patenteRichiesta,
      capienza: b.capienza,
      porto: b.porto?.nome ?? null,
      azienda: b.tenant.nome,
      aziendaSlug: b.tenant.slug,
      prezzoDaCent: b.tariffe.length ? Math.min(...b.tariffe.map((t) => t.prezzoCent)) : null,
      voto: v?.voto ?? 0,
      recensioni: v?.n ?? 0,
    };
  });
  const tipi = Array.from(new Set(tutte.map((s) => s.tipo).filter(Boolean))) as string[];
  const porti = Array.from(new Set(tutte.map((s) => s.porto).filter(Boolean))) as string[];
  const schede = tutte.filter((s) => (!filtri.tipo || s.tipo === filtri.tipo) && (!filtri.porto || s.porto === filtri.porto));
  return { schede, tipi, porti };
}
