import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verificaDisponibilita } from "@/lib/disponibilita";
import { calcolaImporti } from "@/lib/payments";

// Dati pubblici del marketplace NaBoat. Sono letture server-side senza sessione:
// espongono SOLO ciò che è pubblicato e approvato, mai matricola o dati fiscali.

// --- M01: regola UNICA di pubblicabilità -----------------------------------
// Idoneità al catalogo pubblico (azienda + barca + requisiti), NON disponibilità
// in una data: la disponibilità la calcola src/lib/disponibilita.ts.
// Questo filtro è la fonte di verità: cataloghi, schede, profilo azienda, sitemap
// e controlli di pubblicazione devono usarlo, così la regola resta una sola.
export const FILTRO_BARCA_CATALOGO: Prisma.BoatWhereInput = {
  uso: "noleggio",
  archiviato: false,
  pubblicata: true,
  inPausa: false,
  bloccataAdmin: false,
  OR: [{ fotoGallery: { isEmpty: false } }, { fotoCopertina: { not: null } }],
  tariffe: { some: { attivo: true } },
};

export const FILTRO_CATALOGO: Prisma.BoatWhereInput = {
  ...FILTRO_BARCA_CATALOGO,
  tenant: { status: "active", moduloMarketplace: true },
};

// Requisiti valutati su una barca già caricata (stessa regola del filtro).
// Serve a spiegare con un messaggio chiaro perché una barca non è pubblicabile.
export type RequisitiCatalogo = {
  uso: string;
  archiviato: boolean;
  pubblicata: boolean;
  inPausa: boolean;
  bloccataAdmin: boolean;
  fotoCopertina: string | null;
  fotoGallery: string[];
  tariffeAttive: number;
  aziendaStatus: string;
  moduloMarketplace: boolean;
};

export function motivoNonIdonea(r: RequisitiCatalogo): string | null {
  if (r.aziendaStatus !== "active") return "Azienda non attiva";
  if (!r.moduloMarketplace) return "Il modulo Marketplace è disattivato per questa azienda";
  if (r.uso !== "noleggio") return "La barca non è destinata al noleggio";
  if (r.archiviato) return "Barca archiviata";
  if (r.bloccataAdmin) return "Barca bloccata da NaBoat";
  if (!r.pubblicata) return "Barca non pubblicata";
  if (r.inPausa) return "Barca in pausa";
  if (!r.fotoCopertina && r.fotoGallery.length === 0) return "Per pubblicare serve almeno una foto";
  if (r.tariffeAttive < 1) return "Per pubblicare serve un prezzo nel listino";
  return null;
}

export type NumeriPiattaforma = { barche: number; senzaPatente: number; conSkipper: number; localita: number };

// Numeri reali della piattaforma per la home, ricavati da caratteristiche PUBBLICHE
// attuali (niente deduzioni dalle prenotazioni storiche).
export async function numeriPiattaforma(): Promise<NumeriPiattaforma> {
  const [barche, senzaPatente, conSkipper, localita] = await Promise.all([
    prisma.boat.count({ where: FILTRO_CATALOGO }),
    prisma.boat.count({ where: { ...FILTRO_CATALOGO, patenteRichiesta: false } }),
    // «Con skipper» = la barca è di un'azienda che ha almeno uno skipper in servizio.
    // È una proprietà reale e attuale (l'azienda offre il servizio), non lo storico
    // delle prenotazioni: se un'azienda non ha skipper attivi la barca non si conta.
    prisma.boat.count({
      where: { ...FILTRO_CATALOGO, tenant: { status: "active", moduloMarketplace: true, skippers: { some: { attivo: true } } } },
    }),
    prisma.porto.count({ where: { tenant: { status: "active" } } }),
  ]);
  return { barche, senzaPatente, conSkipper, localita };
}

// ============================================================================
// M03 — PREVENTIVO UNICO (prezzo determinato oppure «da definire»)
// Una sola funzione calcola l'offerta: la usano il listino aziendale, la scheda
// barca e la richiesta pubblica. Regola ferma: se manca il prezzo determinato NON
// si sceglie il minimo fra voci incompatibili (altra unità o altra stagione): il
// risultato è «preventivo da definire».
// ============================================================================

export const TIPI_TARIFFA = ["mezza_giornata", "giornata", "settimana"] as const;
export type TipoTariffa = (typeof TIPI_TARIFFA)[number];
export type Stagione = "alta" | "bassa";

// Stagione alta: 1 giugno – 30 settembre (stessa regola del listino aziendale).
export function stagioneDi(data: Date): Stagione {
  const mese = data.getUTCMonth() + 1;
  return mese >= 6 && mese <= 9 ? "alta" : "bassa";
}

// Tipo di noleggio dedotto dalla durata richiesta (soglie semplici e modificabili).
export function tipoDaDurata(startAt: Date, endAt: Date): TipoTariffa {
  const ore = (endAt.getTime() - startAt.getTime()) / 3600000;
  if (ore <= 6) return "mezza_giornata";
  if (ore <= 30) return "giornata";
  return "settimana";
}

type TariffaScelta = { id: string; boatId: string | null; tipo: string; stagione: string; prezzoCent: number; createdAt?: Date };

// PRECEDENZA ESPLICITA delle tariffe (dall'alta alla bassa):
//   1. tariffa della barca, stagione esatta (alta/bassa)
//   2. tariffa della barca, "tutto_anno"
//   3. tariffa generale dell'azienda (boatId null), stagione esatta
//   4. tariffa generale, "tutto_anno"
// Non si usano MAI un'altra stagione o un'altra unità (tipo): non sono un prezzo
// valido per la richiesta. Se nessuna voce corrisponde, il prezzo è da definire.
// Questa è l'unica fonte di scelta: la usa anche GET /api/v1/tariffe.
export function sceglieTariffa<T extends TariffaScelta>(
  candidate: T[],
  boatId: string | null,
  tipo: TipoTariffa,
  stagione: Stagione
): T | null {
  const peso = (c: T) => (c.boatId === boatId ? 0 : 2) + (c.stagione === stagione ? 0 : 1);
  const valide = candidate.filter((c) => c.tipo === tipo && (c.stagione === stagione || c.stagione === "tutto_anno"));
  if (!valide.length) return null;
  return valide
    .slice()
    .sort(
      (a, b) =>
        peso(a) - peso(b) ||
        String(b.createdAt?.getTime() ?? 0).localeCompare(String(a.createdAt?.getTime() ?? 0)) ||
        a.id.localeCompare(b.id)
    )[0];
}

// Versione dello schema dello snapshot: alzandola si riconoscono le offerte vecchie.
export const PREVENTIVO_VERSIONE = "1";

export type VoceExtraPreventivo = {
  id: string;
  nome: string;
  unita: string;
  prezzoCent: number;
  quantita: number;
  quantitaMax: number | null;
  totaleCent: number;
};

export type Preventivo = {
  stato: "determinato" | "da_definire";
  motivo: string | null;
  versione: string;
  congelatoAt: string;
  origineCanale: string;
  tipo: TipoTariffa;
  stagione: Stagione;
  data: string;
  prezzoNoleggioCent: number | null;
  tariffaId: string | null;
  skipper: boolean;
  extra: VoceExtraPreventivo[];
  extraDisponibili: Array<{ id: string; nome: string; unita: string; prezzoCent: number; quantitaMax: number | null }>;
  extraTotaleCent: number;
  feeNaboatPct: number;
  feeProviderPct: number;
  feeProviderFixedCent: number;
  feeNaboatCent: number;
  feeProviderCent: number;
  commissioniCent: number;
  totaleClienteCent: number | null;
};

// Extra ammessi su una barca: attivi, oppure non limitati (boatIds vuoto = tutte).
// La quantità richiesta viene limitata a quantitaMax. Il prezzo (in euro, come
// convenzione del modello Extra) viene convertito in centesimi interi.
export function extraAmmesse(
  extras: Array<{ id: string; nome: string; prezzo: number | null; unita: string; quantitaMax: number | null; boatIds: string[]; attivo: boolean }>,
  boatId: string,
  richiesti: Array<{ extraId: string; quantita?: number }>
): VoceExtraPreventivo[] {
  const richiesta = new Map(richiesti.map((r) => [r.extraId, r.quantita ?? 1]));
  return extras
    .filter((e) => e.attivo && (e.boatIds.length === 0 || e.boatIds.includes(boatId)))
    .filter((e) => richiesta.has(e.id))
    .map((e) => {
      const q = richiesta.get(e.id) ?? 1;
      const quantita = Math.max(1, Math.min(q, e.quantitaMax ?? q));
      const prezzoCent = e.prezzo != null ? Math.round(e.prezzo * 100) : 0;
      return { id: e.id, nome: e.nome, unita: e.unita, prezzoCent, quantita, quantitaMax: e.quantitaMax, totaleCent: prezzoCent * quantita };
    });
}

// Tariffa scelta per un preventivo, leggendo il listino attivo dell'azienda.
export async function tariffaPerPreventivo(
  tenantId: string,
  boatId: string | null,
  tipo: TipoTariffa,
  stagione: Stagione
): Promise<{ prezzoCent: number; tariffaId: string } | null> {
  const candidate = await prisma.tariffa.findMany({
    where: {
      tenantId,
      attivo: true,
      tipo,
      stagione: { in: [stagione, "tutto_anno"] },
      ...(boatId ? { OR: [{ boatId }, { boatId: null }] } : {}),
    },
  });
  const scelta = sceglieTariffa(candidate, boatId, tipo, stagione);
  return scelta ? { prezzoCent: scelta.prezzoCent, tariffaId: scelta.id } : null;
}

export type PreventivoInput = {
  tenantId: string;
  boatId: string;
  startAt: Date;
  endAt: Date;
  passeggeri?: number;
  extraRichiesti?: Array<{ extraId: string; quantita?: number }>;
  skipper?: boolean;
  origineCanale?: string;
};

// Calcola l'offerta completa: prezzo del noleggio, extra ammessi, commissioni.
export async function preventivoNoleggio(input: PreventivoInput): Promise<Preventivo> {
  const tipo = tipoDaDurata(input.startAt, input.endAt);
  const stagione = stagioneDi(input.startAt);
  const origineCanale = input.origineCanale ?? "diretto";

  const [tar, extras, t] = await Promise.all([
    tariffaPerPreventivo(input.tenantId, input.boatId, tipo, stagione),
    prisma.extra.findMany({ where: { tenantId: input.tenantId }, orderBy: { nome: "asc" } }),
    prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { feeNaboatPct: true, feeProviderPct: true, feeProviderFixedCent: true, moduloMarketplace: true },
    }),
  ]);

  const prezzoNoleggioCent = tar?.prezzoCent ?? null;
  const extra = extraAmmesse(extras, input.boatId, input.extraRichiesti ?? []);
  const extraDisponibili = extras
    .filter((e) => e.attivo && (e.boatIds.length === 0 || e.boatIds.includes(input.boatId)))
    .map((e) => ({ id: e.id, nome: e.nome, unita: e.unita, prezzoCent: e.prezzo != null ? Math.round(e.prezzo * 100) : 0, quantitaMax: e.quantitaMax }));
  const extraTotaleCent = extra.reduce((s, e) => s + e.totaleCent, 0);

  // La fee NaBoat matura solo dal canale NaBoat e con il modulo marketplace attivo.
  const feeNaboatPct = t && t.moduloMarketplace !== false && origineCanale === "naboat" ? t.feeNaboatPct : 0;
  const feeProviderPct = t?.feeProviderPct ?? 0;
  const feeProviderFixedCent = t?.feeProviderFixedCent ?? 0;
  let feeNaboatCent = 0;
  let feeProviderCent = 0;
  if (prezzoNoleggioCent != null && prezzoNoleggioCent > 0) {
    const importi = calcolaImporti(prezzoNoleggioCent, feeNaboatPct, feeProviderPct, feeProviderFixedCent, feeNaboatPct > 0);
    feeNaboatCent = importi.feeNaboatCent;
    feeProviderCent = importi.feeProviderCent;
  }
  const commissioniCent = feeNaboatCent + feeProviderCent;
  const determinato = prezzoNoleggioCent != null && prezzoNoleggioCent > 0;

  return {
    stato: determinato ? "determinato" : "da_definire",
    motivo: determinato ? null : `Nessuna tariffa «${tipo}» in listino per la stagione ${stagione}: preventivo da definire con l'azienda`,
    versione: PREVENTIVO_VERSIONE,
    congelatoAt: new Date().toISOString(),
    origineCanale,
    tipo,
    stagione,
    data: input.startAt.toISOString(),
    prezzoNoleggioCent,
    tariffaId: tar?.tariffaId ?? null,
    skipper: !!input.skipper,
    extra,
    extraDisponibili,
    extraTotaleCent,
    feeNaboatPct,
    feeProviderPct,
    feeProviderFixedCent,
    feeNaboatCent,
    feeProviderCent,
    commissioniCent,
    totaleClienteCent: determinato ? (prezzoNoleggioCent as number) + extraTotaleCent + commissioniCent : null,
  };
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
  // M04: solo nel catalogo con date — prezzo per la durata richiesta e stato reale.
  conSkipper?: boolean;
  prezzoPeriodoCent?: number | null;
  prezzoEtichetta?: string | null;
  disponibile?: boolean;
};

// Criterio del carosello (documentato, non fornito dalla fonte): punteggio = voto medio × ln(recensioni+1);
// a parità di punteggio si ordina per inserimento più recente. Con zero recensioni il punteggio è 0.
export async function barcheInEvidenza(limite = 6): Promise<SchedaEvidenza[]> {
  const boats = await prisma.boat.findMany({
    where: FILTRO_CATALOGO,
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
    where: { id, ...FILTRO_CATALOGO },
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
      ? { id: pagina.refId, status: "active", moduloMarketplace: true }
      : { OR: [{ slug }, { id: slug }], status: "active", moduloMarketplace: true },
    include: {
      porti: { orderBy: { nome: "asc" } },
      boats: {
        where: FILTRO_BARCA_CATALOGO,
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

export type FiltriCatalogo = {
  tipo?: string;
  porto?: string;
  dal?: string; // YYYY-MM-DD
  al?: string; // YYYY-MM-DD (facoltativo: se manca si usa il giorno di partenza)
  persone?: number;
  skipper?: boolean; // richiede che l'azienda offra lo skipper
  patente?: "si" | "no"; // requisito di patente dichiarato sulla barca
};

export type CatalogoPubblico = {
  schede: SchedaEvidenza[];
  tipi: string[];
  porti: string[];
  conData: boolean;
  filtri: FiltriCatalogo;
};

// Interpreta una data civile (YYYY-MM-DD) come inizio/fine giornata UTC.
function inizioGiorno(s: string): Date | null {
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function fineGiorno(s: string): Date {
  return new Date(`${s}T23:59:59.999Z`);
}

// Filtra le barche con il SERVIZIO DI DISPONIBILITÀ CONDIVISO (src/lib/disponibilita.ts):
// stessa regola di prenotazioni e blocchi, mai una copia locale.
async function filtraDisponibili(boats: Array<{ id: string; tenantId: string }>, startAt: Date, endAt: Date): Promise<Set<string>> {
  if (!boats.length) return new Set();
  return prisma.$transaction(
    async (tx) => {
      const ok = new Set<string>();
      for (const b of boats) {
        const esito = await verificaDisponibilita(tx, { tenantId: b.tenantId, boatId: b.id, startAt, endAt });
        if (esito.ok) ok.add(b.id);
      }
      return ok;
    },
    { timeout: 20000 }
  );
}

const ETICHETTA_TIPO: Record<TipoTariffa, string> = {
  mezza_giornata: "mezza giornata",
  giornata: "giornata",
  settimana: "settimana",
};

// Catalogo pubblico con i filtri del percorso «Noleggia una barca». I filtri
// principali sono luogo, date e persone; tipo, skipper e requisiti sono progressivi.
// Con le date presenti si usa la disponibilità reale e il prezzo per la durata.
export async function catalogoPubblico(filtri: FiltriCatalogo = {}): Promise<CatalogoPubblico> {
  const boats = await prisma.boat.findMany({
    where: FILTRO_CATALOGO,
    include: {
      porto: { select: { nome: true } },
      tenant: { select: { nome: true, slug: true, skippers: { where: { attivo: true }, select: { id: true }, take: 1 } } },
      tariffe: { where: { attivo: true }, select: { id: true, boatId: true, tipo: true, stagione: true, prezzoCent: true, createdAt: true } },
    },
    orderBy: { nome: "asc" },
  });

  const start = filtri.dal ? inizioGiorno(filtri.dal) : null;
  const end = filtri.al ? fineGiorno(filtri.al) : filtri.dal ? fineGiorno(filtri.dal) : null;
  const conData = !!(start && end && start < end);
  const tipoPeriodo = conData ? tipoDaDurata(start!, end!) : null;
  const stagionePeriodo = conData ? stagioneDi(start!) : null;

  // Facet calcolate su tutto il catalogo: le opzioni non spariscono cambiando filtro.
  const tipi = Array.from(new Set(boats.map((b) => b.tipo).filter(Boolean))) as string[];
  const porti = Array.from(new Set(boats.map((b) => b.porto?.nome).filter(Boolean))) as string[];

  let filtrate = boats.filter((b) => {
    const conSkipper = b.tenant.skippers.length > 0;
    if (filtri.tipo && b.tipo !== filtri.tipo) return false;
    if (filtri.porto && b.porto?.nome !== filtri.porto) return false;
    if (filtri.persone && b.capienza < filtri.persone) return false;
    if (filtri.skipper === true && !conSkipper) return false;
    if (filtri.skipper === false && conSkipper) return false;
    if (filtri.patente === "si" && !b.patenteRichiesta) return false;
    if (filtri.patente === "no" && b.patenteRichiesta) return false;
    return true;
  });

  // Con le date: si tengono solo le barche davvero libere, con il servizio condiviso.
  if (conData) {
    const disponibili = await filtraDisponibili(filtrate.map((b) => ({ id: b.id, tenantId: b.tenantId })), start!, end!);
    filtrate = filtrate.filter((b) => disponibili.has(b.id));
  }

  const ids = filtrate.map((b) => b.id);
  const [val, slugs] = await Promise.all([valutazioniPerBarche(ids), slugsBarche(ids)]);
  const schede: SchedaEvidenza[] = filtrate.map((b) => {
    const v = val.get(b.id);
    const conSkipper = b.tenant.skippers.length > 0;
    let prezzoPeriodoCent: number | null = null;
    if (conData && tipoPeriodo && stagionePeriodo) {
      const scelta = sceglieTariffa(b.tariffe, b.id, tipoPeriodo, stagionePeriodo);
      prezzoPeriodoCent = scelta?.prezzoCent ?? null;
    }
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
      conSkipper,
      prezzoPeriodoCent,
      prezzoEtichetta: conData && tipoPeriodo ? ETICHETTA_TIPO[tipoPeriodo] : null,
      disponibile: conData ? true : undefined,
    };
  });

  return { schede, tipi, porti, conData, filtri };
}
