import { ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";

// Anagrafica alimentata dalle prenotazioni, con riuso/deduplica per telefono
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams.get("q")?.trim();
  const list = await prisma.customer.findMany({
    where: { tenantId: t.tenantId, ...(q ? { OR: [{ nome: { contains: q, mode: "insensitive" } }, { telefono: { contains: q } }, { email: { contains: q, mode: "insensitive" } }] } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { bookings: true } } },
  });
  return ok(list);
}
