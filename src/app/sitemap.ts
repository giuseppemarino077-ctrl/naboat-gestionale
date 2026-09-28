import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { DOMINIO_SITO, dominioPubblico } from "@/lib/sito";

// Come robots.txt: si aggiorna a ogni richiesta, non alla compilazione.
export const dynamic = "force-dynamic";

const prefisso = (tipo: string) => (tipo === "barca" ? "barca" : tipo === "azienda" ? "azienda" : tipo === "skipper" ? "skipper" : "");

// Pagine del marketplace (schede pubbliche): si aggiungono solo quando NaBoat le attiva.
async function pagineMarketplace(base: string): Promise<MetadataRoute.Sitemap> {
  const pagine = await prisma.seoPage.findMany({
    where: { pubblica: true, noindex: false, slug: { not: null } },
    select: { tipo: true, slug: true, aggiornatoAt: true },
    orderBy: { aggiornatoAt: "desc" },
    take: 5000,
  });

  const voci: MetadataRoute.Sitemap = [];
  for (const p of pagine) {
    if (!p.slug) continue;
    const pre = prefisso(p.tipo);
    voci.push({
      url: pre ? `${base}/${pre}/${p.slug}` : `${base}/${p.slug}`,
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
