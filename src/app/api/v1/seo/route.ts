import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { effettivo } from "@/lib/seo";
import { requireAzienda } from "@/lib/tenant";

// L'azienda vede come appariranno le sue pagine pubbliche (profilo e schede barche)
// e quali parole chiave sono state generate. La modifica è riservata a NaBoat.
export async function GET(req: Request) {
  const t = await requireAzienda(req, { ignoraAbbonamento: true });
  if ("error" in t) return t.error;

  const [impostazioni, pagine, barche, skipper] = await Promise.all([
    prisma.platformSettings.findUnique({ where: { id: "singleton" }, select: { seoPubblicheAttive: true, seoDominioPubblico: true } }),
    prisma.seoPage.findMany({ where: { tenantId: t.tenantId }, orderBy: { tipo: "asc" } }),
    prisma.boat.findMany({ where: { tenantId: t.tenantId }, select: { id: true, nome: true } }),
    prisma.skipper.findMany({ where: { tenantId: t.tenantId }, select: { id: true, nome: true } }),
  ]);

  const nomeDi = (tipo: string, refId: string | null) =>
    tipo === "barca" ? barche.find((b) => b.id === refId)?.nome ?? "Barca" : tipo === "skipper" ? skipper.find((s) => s.id === refId)?.nome ?? "Skipper" : "La mia azienda";

  return ok({
    paginePubblicheAttive: impostazioni?.seoPubblicheAttive === true,
    dominio: impostazioni?.seoDominioPubblico ?? null,
    pagine: pagine.map((p) => ({
      id: p.id,
      tipo: p.tipo,
      nome: nomeDi(p.tipo, p.refId),
      pubblica: p.pubblica,
      noindex: p.noindex,
      effettivo: effettivo(p),
      personalizzato: { titolo: !!p.titolo, descrizione: !!p.descrizione, keywords: !!p.keywords },
    })),
  });
}

export async function POST() {
  return fail("La SEO delle pagine pubbliche è gestita da NaBoat", 403);
}
