import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";
import { z } from "zod";

// Controllo NaBoat sui modelli del catalogo inseriti dai noleggiatori.
export async function GET(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const stato = new URL(req.url).searchParams.get("stato");
  const modelli = await prisma.modelloBarca.findMany({
    where: stato ? { stato } : {},
    orderBy: [{ stato: "asc" }, { createdAt: "desc" }],
    take: 500,
    include: { boats: { select: { id: true, nome: true, tenantId: true } } },
  });
  return ok(modelli);
}

const Schema = z.object({ id: z.string().uuid(), azione: z.enum(["approva", "rifiuta"]) });

export async function PATCH(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const m = await prisma.modelloBarca.findUnique({ where: { id: p.data.id } });
  if (!m) return fail("Modello non trovato", 404);
  const aggiornato = await prisma.modelloBarca.update({
    where: { id: m.id },
    data: { stato: p.data.azione === "approva" ? "approvato" : "rifiutato", verificatoAt: new Date() },
  });
  await prisma.auditLog.create({ data: { actorId: g.session.sub, azione: `modello.${p.data.azione}`, entita: "ModelloBarca", entitaId: m.id } });
  return ok(aggiornato);
}
