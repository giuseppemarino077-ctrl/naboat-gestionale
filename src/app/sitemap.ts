import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { FILTRO_CATALOGO } from "@/lib/marketplace";
import { DOMINIO_SITO, dominioPubblico } from "@/lib/sito";

// Come robots.txt: si aggiorna a ogni richiesta, non alla compilazione.
export const dynamic = "force-dynamic";

// Prefisso dell'indirizzo pubblico. barca/azienda sono le uniche schede con una
// pagina reale: gli skipper non hanno una pagina propria, quindi non si segnalano.
const prefisso = (tipo: string) => (tipo === "barca" ? "barca" : tipo === "azienda" ? "azienda" : "");

// Pagine del marketplace (schede pubbliche): si aggiungono solo quando NaBoat le attiva
// e solo se l'entità è ancora idonea al catalogo (M01). Una pagina SEO pubblicata non
// basta: barca bloccata, senza foto/prezzo, azienda sospesa o marketplace spento non
// devono finire qui. FILTRO_CATALOGO è la stessa regola usata dal catalogo e dalle schede.
async function pagineMarketplace(base: string): Promise<MetadataRoute.Sitemap> {
  const [pagine, barcheOk, aziendeOk] = await Promise.all([
    prisma.seoPage.findMany({
      where: { pubblica: true, noindex: false, slug: { not: null }, tipo: { in: ["barca", "azienda"] } },
      select: { tipo: true, slug: true, refId: true, tenantId: true, aggiornatoAt: true },
      orderBy: { aggiornatoAt: "desc" },
      take: 5000,
    }),
    prisma.boat.findMany({ where: FILTRO_CATALOGO, select: { id: true } }),
    prisma.tenant.findMany({ where: { status: "active", moduloMarketplace: true }, select: { id: true } }),
  ]);
  const idBarche = new Set(barcheOk.map((b) => b.id));
  const idAziende = new Set(aziendeOk.map((t) => t.id));

  const voci: MetadataRoute.Sitemap = [];
  for (const p of pagine) {
    if (!p.slug) continue;
    if (p.tipo === "barca" && (!p.refId || !idBarche.has(p.refId))) continue;
    if (p.tipo === "azienda" && (!p.refId || !idAziende.has(p.refId))) continue;
    const pre = prefisso(p.tipo);
    if (!pre) continue;
    voci.push({
      url: `${base}/${pre}/${p.slug}`,
      lastModified: p.aggiornatoAt,
      changeFrequency: p.tipo === "barca" ? "weekly" : "monthly",
      priority: p.tipo === "azienda" ? 0.8 : 0.7,
    });
  }
  return voci;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const host = h.get("host") ?? "";

  const s = await prisma.platformSettings
    .findUnique({ where: { id: "singleton" }, select: { seoPubblicheAttive: true, seoDominioPubblico: true, manutenzioneAttiva: true } })
    .catch(() => null);

  const base = (s?.seoDominioPubblico || "").replace(/\/$/, "");

  // Sul dominio del sito ci sono sempre la home e le pagine vetrina.
  if (dominioPubblico(host)) {
    const b = base || DOMINIO_SITO;
    // Con il portale in manutenzione le pagine mostrano tutte lo stesso messaggio:
    // si segnala solo la home, per non far indicizzare tre pagine identiche.
    if (s?.manutenzioneAttiva === true) {
      return [{ url: `${b}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];
    }
    const voci: MetadataRoute.Sitemap = [
      { url: `${b}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
      { url: `${b}/noleggia`, changeFrequency: "weekly", priority: 0.9 },
      { url: `${b}/per-noleggiatori`, changeFrequency: "monthly", priority: 0.7 },
      { url: `${b}/chi-siamo`, changeFrequency: "monthly", priority: 0.6 },
      { url: `${b}/contatti`, changeFrequency: "monthly", priority: 0.6 },
      { url: `${b}/privacy`, changeFrequency: "yearly", priority: 0.3 },
      { url: `${b}/cookie`, changeFrequency: "yearly", priority: 0.3 },
      { url: `${b}/termini`, changeFrequency: "yearly", priority: 0.3 },
    ];
    if (s?.seoPubblicheAttive === true) voci.push(...(await pagineMarketplace(b)));
    return voci;
  }

  // Sul portale la mappa resta vuota finché NaBoat non attiva le pagine pubbliche:
  // così non si segnalano ai motori indirizzi che non esistono.
  if (s?.seoPubblicheAttive !== true) return [];
  if (!base) return [];

  return [
    { url: `${base}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    ...(await pagineMarketplace(base)),
  ];
}
