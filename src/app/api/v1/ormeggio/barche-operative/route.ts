import { ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/modules/ormeggio/accesso";
export async function GET(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const now = new Date();
  return ok(await prisma.boat.findMany({ where: { tenantId: t.tenantId, uso: "custodia", archiviato: false, proprietarioId: { not: null }, assegnazioniPosto: { none: { tenantId: t.tenantId, dal: { lte: now }, OR: [{ al: null }, { al: { gt: now } }] } } }, select: { id: true, nome: true, tipo: true, proprietarioId: true, revisione: true }, orderBy: { nome: "asc" } }));
}
