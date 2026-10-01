import { prisma } from "@/lib/db";
import { leggiPaginazione, rispostaPaginata } from "@/lib/paginazione";
import { requireAzienda } from "@/lib/tenant";
import { chiaveTelefono, normalizzaTelefono } from "@/lib/telefono";
import type { Prisma } from "@prisma/client";

// Anagrafica alimentata dalle prenotazioni, con riuso/deduplica per telefono.
// La ricerca per telefono riconosce le varianti (spazi, +39, 00…) cercando il
// valore canonico oltre che la stringa digitata.
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams;
  const cerca = q.get("q")?.trim();
  const canonico = cerca ? chiaveTelefono(cerca) : null;
  const soloCifre = cerca ? cerca.replace(/\D/g, "") : "";
  const condizioni: Prisma.CustomerWhereInput[] = [];
  if (cerca) {
    condizioni.push({ nome: { contains: cerca, mode: "insensitive" } });
    condizioni.push({ email: { contains: cerca, mode: "insensitive" } });
    if (canonico) condizioni.push({ telefono: canonico });
    if (soloCifre.length >= 2) condizioni.push({ telefono: { contains: soloCifre } });
    else condizioni.push({ telefono: { contains: cerca } });
  }
  const where: Prisma.CustomerWhereInput = {
    tenantId: t.tenantId,
    ...(condizioni.length ? { OR: condizioni } : {}),
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
