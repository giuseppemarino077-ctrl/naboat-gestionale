import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";
import { effettivo, generaPiattaforma, rigeneraTutto, salvaPagina } from "@/lib/seo";
import { z } from "zod";

// NaBoat: pagina SEO dedicata. Impostazioni globali, elenco delle pagine pubbliche,
// modifica manuale dei testi e rigenerazione automatica dai dati reali.
export async function GET() {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;

  // La pagina della piattaforma esiste sempre: alla prima apertura viene creata.
  const esistente = await prisma.seoPage.findFirst({ where: { tipo: "piattaforma" }, select: { id: true } });
  if (!esistente) {
    const s = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
    await salvaPagina("piattaforma", null, null, generaPiattaforma({
      seoTitoloDefault: s?.seoTitoloDefault ?? null,
      seoDescrizioneDefault: s?.seoDescrizioneDefault ?? null,
      seoKeywordsDefault: s?.seoKeywordsDefault ?? null,
      seoLocalitaDefault: s?.seoLocalitaDefault ?? null,
    }));
  }

  const [impostazioni, pagine, conteggi] = await Promise.all([
    prisma.platformSettings.findUnique({ where: { id: "singleton" } }),
    prisma.seoPage.findMany({
      orderBy: [{ tipo: "asc" }, { creatoAt: "asc" }],
      take: 1000,
    }),
    Promise.all([prisma.tenant.count({ where: { status: "active" } }), prisma.boat.count(), prisma.skipper.count()]),
  ]);

  // Nomi leggibili per barca e skipper
  const barche = await prisma.boat.findMany({ select: { id: true, nome: true, tenantId: true } });
  const skipper = await prisma.skipper.findMany({ select: { id: true, nome: true, tenantId: true } });
  const aziende = await prisma.tenant.findMany({ select: { id: true, nome: true } });
  const nomeDi = (tipo: string, refId: string | null) =>
    tipo === "barca" ? barche.find((b) => b.id === refId)?.nome ?? "Barca rimossa" : tipo === "skipper" ? skipper.find((s) => s.id === refId)?.nome ?? "Skipper rimosso" : null;

  return ok({
    impostazioni: {
      seoPubblicheAttive: impostazioni?.seoPubblicheAttive ?? false,
      seoTitoloDefault: impostazioni?.seoTitoloDefault ?? "",
      seoDescrizioneDefault: impostazioni?.seoDescrizioneDefault ?? "",
      seoKeywordsDefault: impostazioni?.seoKeywordsDefault ?? "",
      seoImmagineDefault: impostazioni?.seoImmagineDefault ?? "",
      seoDominioPubblico: impostazioni?.seoDominioPubblico ?? "",
      seoAnalyticsId: impostazioni?.seoAnalyticsId ?? "",
      seoVerificaGoogle: impostazioni?.seoVerificaGoogle ?? "",
      seoLocalitaDefault: impostazioni?.seoLocalitaDefault ?? "",
    },
    conteggi: { aziende: conteggi[0], barche: conteggi[1], skipper: conteggi[2] },
    pagine: pagine.map((p) => ({
      id: p.id,
      tipo: p.tipo,
      refId: p.refId,
      slug: p.slug,
      pubblica: p.pubblica,
      noindex: p.noindex,
      titoloAuto: p.titoloAuto,
      descrizioneAuto: p.descrizioneAuto,
      keywordsAuto: p.keywordsAuto,
      titolo: p.titolo,
      descrizione: p.descrizione,
      keywords: p.keywords,
      immagine: p.immagine,
      aggiornatoAt: p.aggiornatoAt,
      azienda: p.tenantId ? aziende.find((a) => a.id === p.tenantId)?.nome ?? null : null,
      nome: nomeDi(p.tipo, p.refId),
      effettivo: effettivo(p),
    })),
  });
}

const ImpostazioniSchema = z
  .object({
    azione: z.literal("impostazioni"),
    seoPubblicheAttive: z.boolean(),
    seoTitoloDefault: z.string().max(120).optional().nullable(),
    seoDescrizioneDefault: z.string().max(300).optional().nullable(),
    seoKeywordsDefault: z.string().max(600).optional().nullable(),
    seoImmagineDefault: z.string().max(500).optional().nullable(),
    seoDominioPubblico: z.string().max(200).optional().nullable(),
    seoAnalyticsId: z.string().max(60).optional().nullable(),
    seoVerificaGoogle: z.string().max(200).optional().nullable(),
    seoLocalitaDefault: z.string().max(120).optional().nullable(),
  })
  .strict();

const PaginaSchema = z
  .object({
    azione: z.literal("pagina"),
    id: z.string().uuid(),
    pubblica: z.boolean().optional(),
    noindex: z.boolean().optional(),
    slug: z.string().max(80).optional().nullable(),
    titolo: z.string().max(120).optional().nullable(),
    descrizione: z.string().max(300).optional().nullable(),
    keywords: z.string().max(600).optional().nullable(),
    immagine: z.string().max(500).optional().nullable(),
  })
  .strict();

export async function PATCH(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => null);

  const imp = ImpostazioniSchema.safeParse(body);
  if (imp.success) {
    const d = imp.data;
    const salvato = await prisma.platformSettings.upsert({
      where: { id: "singleton" },
      update: {
        seoPubblicheAttive: d.seoPubblicheAttive,
        seoTitoloDefault: d.seoTitoloDefault ?? null,
        seoDescrizioneDefault: d.seoDescrizioneDefault ?? null,
        seoKeywordsDefault: d.seoKeywordsDefault ?? null,
        seoImmagineDefault: d.seoImmagineDefault ?? null,
        seoDominioPubblico: d.seoDominioPubblico ?? null,
        seoAnalyticsId: d.seoAnalyticsId ?? null,
        seoVerificaGoogle: d.seoVerificaGoogle ?? null,
        seoLocalitaDefault: d.seoLocalitaDefault ?? null,
      },
      create: {
        id: "singleton",
        seoPubblicheAttive: d.seoPubblicheAttive,
        seoTitoloDefault: d.seoTitoloDefault ?? null,
        seoDescrizioneDefault: d.seoDescrizioneDefault ?? null,
        seoKeywordsDefault: d.seoKeywordsDefault ?? null,
        seoImmagineDefault: d.seoImmagineDefault ?? null,
        seoDominioPubblico: d.seoDominioPubblico ?? null,
        seoAnalyticsId: d.seoAnalyticsId ?? null,
        seoVerificaGoogle: d.seoVerificaGoogle ?? null,
        seoLocalitaDefault: d.seoLocalitaDefault ?? null,
      },
    });
    await prisma.auditLog.create({ data: { actorId: g.session.sub, azione: "seo.impostazioni", entita: "PlatformSettings", entitaId: salvato.id } });
    return ok({ salvato: true });
  }

  const pag = PaginaSchema.safeParse(body);
  if (pag.success) {
    const d = pag.data;
    const pagina = await prisma.seoPage.findUnique({ where: { id: d.id }, select: { id: true, slug: true } });
    if (!pagina) return fail("Pagina SEO non trovata", 404);

    if (d.slug !== undefined && d.slug !== null) {
      const pulito = d.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
      if (pulito.length < 2) return fail("Indirizzo non valido", 422);
      const occupato = await prisma.seoPage.findUnique({ where: { slug: pulito }, select: { id: true } });
      if (occupato && occupato.id !== pagina.id) return fail("Indirizzo già usato da un'altra pagina", 409);
      d.slug = pulito;
    }

    const upd = await prisma.seoPage.update({
      where: { id: pagina.id },
      data: {
        ...(d.pubblica !== undefined ? { pubblica: d.pubblica } : {}),
        ...(d.noindex !== undefined ? { noindex: d.noindex } : {}),
        ...(d.slug !== undefined ? { slug: d.slug } : {}),
        ...(d.titolo !== undefined ? { titolo: d.titolo } : {}),
        ...(d.descrizione !== undefined ? { descrizione: d.descrizione } : {}),
        ...(d.keywords !== undefined ? { keywords: d.keywords } : {}),
        ...(d.immagine !== undefined ? { immagine: d.immagine } : {}),
      },
    });
    await prisma.auditLog.create({ data: { tenantId: upd.tenantId, actorId: g.session.sub, azione: "seo.pagina", entita: "SeoPage", entitaId: upd.id } });
    return ok({ id: upd.id });
  }

  return fail("Richiesta non valida", 422);
}

// Rigenerazione automatica di tutti i testi dai dati reali.
export async function POST(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => ({}));
  if (body?.azione !== "rigenera") return fail("Azione non valida", 422);
  const conteggi = await rigeneraTutto();
  await prisma.auditLog.create({ data: { actorId: g.session.sub, azione: "seo.rigenerato", entita: "SeoPage" } });
  return ok(conteggi);
}
