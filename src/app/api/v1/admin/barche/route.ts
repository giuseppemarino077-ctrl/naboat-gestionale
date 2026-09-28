import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";
import { z } from "zod";

// Elenco barche a livello di piattaforma, con possibilità di nascondere una barca non conforme.
export async function GET(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const q = new URL(req.url).searchParams;
  const stato = q.get("stato");
  const cerca = (q.get("q") ?? "").trim().toLowerCase();
  const boats = await prisma.boat.findMany({
    where: {
      uso: "noleggio",
      ...(stato === "pubblicate" ? { pubblicata: true, inPausa: false } : {}),
      ...(stato === "nascoste" ? { OR: [{ pubblicata: false }, { inPausa: true }] } : {}),
      ...(cerca ? { nome: { contains: cerca, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { tenant: { select: { id: true, nome: true, status: true } } },
  });
  return ok(boats);
}

const Schema = z.object({ boatId: z.string().uuid(), azione: z.enum(["nascondi", "mostra"]) });

export async function PATCH(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const b = await prisma.boat.findUnique({ where: { id: p.data.boatId }, select: { id: true, tenantId: true } });
  if (!b) return fail("Barca non trovata", 404);
  await prisma.boat.update({
    where: { id: b.id },
    data: p.data.azione === "nascondi" ? { pubblicata: false, inPausa: true } : { inPausa: false, pubblicata: true },
  });
  await prisma.auditLog.create({ data: { tenantId: b.tenantId, actorId: g.session.sub, azione: `barca.${p.data.azione}`, entita: "Boat", entitaId: b.id } });
  return ok({ ok: true });
}
