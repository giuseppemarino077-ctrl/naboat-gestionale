import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { DOMINIO_SITO, dominioPubblico } from "@/lib/sito";

// Deve leggere le impostazioni a ogni richiesta: se fosse generato alla compilazione,
// l'interruttore «pagine pubbliche attive» non avrebbe effetto.
export const dynamic = "force-dynamic";

// Il gestionale non deve MAI finire nei motori di ricerca: qui restano bloccate tutte
// le pagine di lavoro. Solo quando NaBoat attiva le pagine pubbliche (marketplace) vengono
// aperte le poche pagine destinate ai turisti.
const PRIVATE = [
  "/api/",
  "/oggi",
  "/calendario",
  "/flotta",
  "/listino",
  "/manutenzione",
  "/turni",
  "/meteo",
  "/clienti",
  "/pagamenti",
  "/resoconto",
  "/abbonamento",
  "/team",
  "/sicurezza",
  "/admin",
  "/anteprima",
  "/progetto",
  "/registro",
  "/ormeggio",
  "/contratto-ormeggio/",
  "/login",
  "/registrazione",
  "/verifica-email",
  "/password-dimenticata",
  "/reimposta-password",
  "/paga/",
  "/contratto/",
];

// Pagine del sito pubblico che i motori possono visitare.
const SITO_APERTE = ["/", "/chi-siamo", "/contatti", "/privacy", "/cookie", "/termini"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const host = h.get("host") ?? "";

  const s = await prisma.platformSettings
    .findUnique({ where: { id: "singleton" }, select: { seoPubblicheAttive: true, seoDominioPubblico: true, manutenzioneAttiva: true } })
    .catch(() => null);

  const base = (s?.seoDominioPubblico || "").replace(/\/$/, "");

  // Sul dominio del sito la home e le pagine vetrina sono sempre indicizzabili;
  // resta escluso tutto il gestionale. Con il portale in manutenzione si lascia
  // leggere solo la home (che mostra il messaggio): serve a far conoscere il dominio
  // a Google e a preparare l'apertura, senza esporre le pagine interne.
  if (dominioPubblico(host)) {
    const b = base || DOMINIO_SITO;
    if (s?.manutenzioneAttiva === true) {
      return {
        rules: [{ userAgent: "*", allow: ["/"], disallow: PRIVATE }],
        sitemap: `${b}/sitemap.xml`,
        host: b,
      };
    }
    return {
      rules: [{ userAgent: "*", allow: SITO_APERTE, disallow: PRIVATE }],
      sitemap: `${b}/sitemap.xml`,
      host: b,
    };
  }

  const pubbliche = s?.seoPubblicheAttive === true;

  if (!pubbliche) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/barca/", "/azienda/", "/skipper/"],
        disallow: PRIVATE,
      },
    ],
    ...(base ? { sitemap: `${base}/sitemap.xml`, host: base } : {}),
  };
}
