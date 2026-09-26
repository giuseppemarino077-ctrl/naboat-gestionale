import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { z } from "zod";

export async function GET(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams;
  const where: any = { tenantId: t.tenantId };
  if (q.get("boatId")) where.boatId = q.get("boatId");
  return ok(await prisma.block.findMany({ where, orderBy: { startAt: "asc" }, take: 200, include: { boat: { select: { nome: true } } } }));
}

const Schema = z.object({
  boatId: z.string().min(1),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  motivo: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati blocco non validi", 422);
  const start = new Date(p.data.startAt);
  const end = new Date(p.data.endAt);
  if (start >= end) return fail("Orari incoerenti", 422);
  const boat = await prisma.boat.findFirst({ where: { id: p.data.boatId, tenantId: t.tenantId } });
  if (!boat) return fail("Barca non trovata", 404);
  const clash = await prisma.booking.findFirst({
    where: { boatId: p.data.boatId, tenantId: t.tenantId, stato: { in: ["prenotata", "in_mare"] }, startAt: { lt: end }, endAt: { gt: start } },
    select: { id: true },
  });
  if (clash) return fail("Esiste una prenotazione nel periodo", 409);
  return ok(await prisma.block.create({ data: { tenantId: t.tenantId, boatId: p.data.boatId, startAt: start, endAt: end, motivo: p.data.motivo } }), 201);
}

// Rimozione completa/per periodo: DELETE con body { boatId?, from?, to? }
export async function DELETE(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const b = await req.json().catch(() => ({}));
  const where: any = { tenantId: t.tenantId };
  if (b.boatId) where.boatId = b.boatId;
  if (b.from) where.startAt = { gte: new Date(b.from) };
  if (b.to) where.endAt = { lte: new Date(b.to) };
  const r = await prisma.block.deleteMany({ where });
  return ok({ rimossi: r.count });
}
