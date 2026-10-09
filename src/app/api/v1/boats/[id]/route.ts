import { fail } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/modules/piattaforma/accesso-azienda";
import { GET as dettaglioNoleggio, PATCH as modificaNoleggio, DELETE as eliminaNoleggio } from "@/modules/noleggio/server/boats/[id]/operazioni";
import { GET as dettaglioCustodia, PATCH as modificaCustodia } from "@/modules/ormeggio/server/barche/[id]/operazioni";

type Context = { params: Promise<{ id: string }> };

async function instrada(req: Request, context: Context) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await context.params;
  const barca = await prisma.boat.findFirst({ where: { id, tenantId: t.tenantId }, select: { uso: true } });
  if (!barca) return fail("Barca non trovata", 404);
  if (barca.uso === "custodia") {
    if (req.method === "GET") return dettaglioCustodia(req, context);
    if (req.method === "PATCH") return modificaCustodia(req, context);
    return fail("Per rimuovere una barca in custodia usa la gestione del proprietario, preservando soste e conti", 409);
  }
  if (req.method === "GET") return dettaglioNoleggio(req, context);
  if (req.method === "PATCH") return modificaNoleggio(req, context);
  return eliminaNoleggio(req, context);
}

export const GET = instrada;
export const PATCH = instrada;
export const DELETE = instrada;
