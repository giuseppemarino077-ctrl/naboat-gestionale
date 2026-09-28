import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";
import { z } from "zod";

// Solo NaBoat: elenco delle prenotazioni di un'azienda (per impostare il canale).
export async function GET(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const tenantId = new URL(req.url).searchParams.get("tenantId");
  if (!tenantId) return fail("Parametro tenantId obbligatorio", 422);
  const bookings = await prisma.booking.findMany({
    where: { tenantId },
    orderBy: { startAt: "desc" },
    take: 40,
    select: {
      id: true,
      clienteNome: true,
      startAt: true,
      stato: true,
      origineCanale: true,
      prezzoCent: true,
      boat: { select: { nome: true } },
    },
  });
  return ok(bookings);
}

// Marca una prenotazione come arrivata dal canale NaBoat (da lì matura la fee)
// oppure la riporta a "diretto". L'azienda non può modificare questo campo.
const Schema = z.object({
  bookingId: z.string().uuid(),
  origineCanale: z.enum(["diretto", "naboat"]),
});

export async function PATCH(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);

  const b = await prisma.booking.findUnique({ where: { id: p.data.bookingId }, select: { id: true, tenantId: true, origineCanale: true } });
  if (!b) return fail("Prenotazione non trovata", 404);

  const upd = await prisma.booking.update({ where: { id: b.id }, data: { origineCanale: p.data.origineCanale } });
  await prisma.auditLog.create({
    data: {
      tenantId: b.tenantId,
      actorId: g.session.sub,
      azione: "admin.booking.canale",
      entita: "Booking",
      entitaId: b.id,
      dettagli: JSON.stringify({ da: b.origineCanale, a: p.data.origineCanale }),
    },
  });
  return ok({ id: upd.id, origineCanale: upd.origineCanale });
}
