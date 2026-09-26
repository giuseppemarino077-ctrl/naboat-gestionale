import { ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";

// Registro delle modifiche dell'azienda: chi ha fatto cosa e con quali valori.
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;

  const q = new URL(req.url).searchParams;
  const limite = Math.min(Number(q.get("limite") ?? 100) || 100, 500);

  const voci = await prisma.auditLog.findMany({
    where: {
      tenantId: t.tenantId,
      ...(q.get("azione") ? { azione: { contains: q.get("azione")! } } : {}),
      ...(q.get("entita") ? { entita: q.get("entita")! } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limite,
    select: { id: true, azione: true, entita: true, entitaId: true, dettagli: true, createdAt: true, actorId: true },
  });

  // Nomi di chi ha fatto la modifica
  const attori = await prisma.user.findMany({
    where: { id: { in: [...new Set(voci.map((v) => v.actorId).filter(Boolean) as string[])] } },
    select: { id: true, nome: true, email: true },
  });

  return ok(
    voci.map((v) => ({
      ...v,
      dettagli: v.dettagli ? JSON.parse(v.dettagli) : null,
      attore: v.actorId ? attori.find((a) => a.id === v.actorId)?.nome ?? attori.find((a) => a.id === v.actorId)?.email ?? null : null,
    }))
  );
}
