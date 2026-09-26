import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

// Calendario operativo: GET ?from=ISO&to=ISO -> barche + prenotazioni + blocchi nel range
export async function GET(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams;
  if (!q.get("from") || !q.get("to")) return fail("Parametri from/to obbligatori (ISO)", 422);
  const from = new Date(q.get("from")!);
  const to = new Date(q.get("to")!);
  if (!(from < to)) return fail("Range non valido", 422);

  const [boats, bookings, blocks] = await Promise.all([
    prisma.boat.findMany({ where: { tenantId: t.tenantId }, orderBy: { nome: "asc" } }),
    prisma.booking.findMany({
      where: { tenantId: t.tenantId, stato: { not: "cancellata" }, startAt: { lt: to }, endAt: { gt: from } },
      orderBy: { startAt: "asc" },
      include: { boat: { select: { nome: true } } },
    }),
    prisma.block.findMany({
      where: { tenantId: t.tenantId, startAt: { lt: to }, endAt: { gt: from } },
      include: { boat: { select: { nome: true } } },
    }),
  ]);
  return ok({ from, to, boats, bookings, blocks });
}
