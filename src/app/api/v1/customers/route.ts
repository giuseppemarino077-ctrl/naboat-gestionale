import { prisma } from "@/lib/db";
import { leggiPaginazione, rispostaPaginata } from "@/lib/paginazione";
import { requireAzienda } from "@/lib/tenant";
import type { Prisma } from "@prisma/client";

// Anagrafica alimentata dalle prenotazioni, con riuso/deduplica per telefono
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams;
  const cerca = q.get("q")?.trim();
  const where: Prisma.CustomerWhereInput = {
    tenantId: t.tenantId,
    ...(cerca
      ? { OR: [{ nome: { contains: cerca, mode: "insensitive" } }, { telefono: { contains: cerca } }, { email: { contains: cerca, mode: "insensitive" } }] }
      : {}),
  };
  // Conteggio e finestra dal database: nessun filtro o taglio in memoria.
  const pag = leggiPaginazione(q, 100);
  const [totale, list] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pag.salta,
      take: pag.dimensione,
      include: { _count: { select: { bookings: true } } },
    }),
  ]);
  return rispostaPaginata(list, totale, pag);
}
