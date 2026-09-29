import { fail, ok } from "@/lib/api";
import { requireCliente } from "@/lib/clienti";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Recensioni del cliente: solo per un'uscita conclusa, una per prenotazione,
// entro la finestra configurata da NaBoat.
export async function GET() {
  const g = await requireCliente();
  if ("error" in g) return g.error;
  const recensioni = await prisma.recensione.findMany({
    where: { clienteAccountId: g.account.id },
    orderBy: { createdAt: "desc" },
    include: { booking: { select: { id: true, startAt: true, boat: { select: { nome: true } }, tenant: { select: { nome: true } } } } },
  });
  return ok(recensioni);
}

const Schema = z.object({
  bookingId: z.string().uuid(),
  voto: z.number().int().min(1).max(5),
  commento: z.string().trim().max(2000).optional(),
});

export async function POST(req: Request) {
  const g = await requireCliente();
  if ("error" in g) return g.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi: il voto va da 1 a 5", 422);

  // La prenotazione deve essere di questo cliente (mai di altri) e conclusa.
  const b = await prisma.booking.findFirst({ where: { id: p.data.bookingId, clienteAccountId: g.account.id } });
  if (!b) return fail("Prenotazione non trovata", 404);
  if (b.stato !== "rientrata") return fail("Puoi recensire solo un'uscita conclusa", 422);

  // La finestra decorre dal rientro effettivo (checkout) o, in mancanza, dalla fine prevista.
  const ps = await prisma.platformSettings.findUnique({ where: { id: "singleton" }, select: { finestraRecensioniGiorni: true } }).catch(() => null);
  const giorni = ps?.finestraRecensioniGiorni ?? 60;
  const riferimento = b.checkoutAt ?? b.endAt;
  const scadenza = new Date(riferimento.getTime() + giorni * 86400000);
  if (new Date() > scadenza) return fail(`La finestra per recensire (${giorni} giorni) è chiusa`, 422);

  // Una sola recensione per prenotazione (vincolo @unique su bookingId): niente
  // sovrascritture silenziose di una recensione già pubblicata.
  const esistente = await prisma.recensione.findUnique({ where: { bookingId: b.id }, select: { id: true } });
  if (esistente) return fail("Hai già recensito questa uscita", 409);

  try {
    const recensione = await prisma.recensione.create({
      data: { tenantId: b.tenantId, bookingId: b.id, clienteAccountId: g.account.id, customerId: b.customerId, voto: p.data.voto, commento: p.data.commento ?? null },
    });
    return ok(recensione, 201);
  } catch (e) {
    // Due invii simultanei: il vincolo di unicità resta il secondo livello.
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") return fail("Hai già recensito questa uscita", 409);
    throw e;
  }
}
