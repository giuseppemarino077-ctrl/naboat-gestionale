import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

// Turni: chi è impegnato in quale giorno, ricavato dalle prenotazioni assegnate allo skipper.
export async function GET(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams;
  const from = q.get("from") ? new Date(q.get("from")!) : new Date();
  const to = q.get("to") ? new Date(q.get("to")!) : new Date(from.getTime() + 14 * 86400000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return fail("Periodo non valido", 422);

  // Se chi guarda è uno skipper, vede solo i suoi turni (se l'account è collegato
  // alla scheda skipper; altrimenti non vede nulla).
  let soloMio: string | null = null;
  if (t.role === "skipper") {
    const suo = await prisma.skipper.findFirst({ where: { tenantId: t.tenantId, userId: t.userId }, select: { id: true } });
    soloMio = suo?.id ?? "nessuno";
  }

  const [skippers, bookings] = await Promise.all([
    prisma.skipper.findMany({
      where: { tenantId: t.tenantId, attivo: true, ...(soloMio ? { id: soloMio } : {}) },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, telefono: true, userId: true },
    }),
    prisma.booking.findMany({
      where: {
        tenantId: t.tenantId,
        skipperId: soloMio ? soloMio : { not: null },
        stato: { in: ["prenotata", "in_mare", "rientrata"] },
        startAt: { gte: from, lte: to },
      },
      orderBy: { startAt: "asc" },
      select: {
        id: true,
        skipperId: true,
        startAt: true,
        endAt: true,
        stato: true,
        clienteNome: true,
        passeggeri: true,
        boat: { select: { nome: true } },
      },
      take: 1000,
    }),
  ]);

  // Totale ore per skipper nel periodo.
  const ore = new Map<string, number>();
  for (const b of bookings) {
    if (!b.skipperId) continue;
    const durata = (b.endAt.getTime() - b.startAt.getTime()) / 3600000;
    ore.set(b.skipperId, (ore.get(b.skipperId) ?? 0) + durata);
  }

  return ok({
    from,
    to,
    skippers: skippers.map((s) => ({
      ...s,
      orePeriodo: Math.round((ore.get(s.id) ?? 0) * 10) / 10,
      uscite: bookings.filter((b) => b.skipperId === s.id).length,
    })),
    bookings,
    senzaSkipper: soloMio
      ? 0
      : await prisma.booking.count({
          where: {
            tenantId: t.tenantId,
            skipperId: null,
            stato: { in: ["prenotata", "in_mare"] },
            startAt: { gte: from, lte: to },
          },
        }),
  });
}
