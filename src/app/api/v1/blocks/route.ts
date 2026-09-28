import { fail, ok } from "@/lib/api";
import { registraAzione } from "@/lib/audit";
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

// Eliminazione di un blocco o di un gruppo di blocchi.
// Un corpo vuoto o malformato non deve MAI cancellare l'intero archivio:
// serve un identificativo, una barca oppure un intervallo from/to completo.
// Le cancellazioni multiple richiedono conferma esplicita e vengono tracciate.
const DeleteSchema = z
  .object({
    id: z.string().min(1).optional(),
    boatId: z.string().min(1).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    conferma: z.boolean().optional(),
  })
  .strict();

export async function DELETE(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;

  const p = DeleteSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Richiesta di eliminazione non valida", 422);
  const b = p.data;

  if (b.id) {
    const r = await prisma.block.deleteMany({ where: { id: b.id, tenantId: t.tenantId } });
    if (r.count === 0) return fail("Blocco non trovato", 404);
    await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: "block.delete", entita: "Block", entitaId: b.id });
    return ok({ rimossi: r.count });
  }

  if (!b.boatId && !(b.from && b.to)) {
    return fail("Specificare id, boatId oppure un intervallo from/to", 422);
  }

  const where: any = { tenantId: t.tenantId };
  if (b.boatId) {
    const boat = await prisma.boat.findFirst({ where: { id: b.boatId, tenantId: t.tenantId }, select: { id: true } });
    if (!boat) return fail("Barca non trovata", 404);
    where.boatId = b.boatId;
  }
  if (b.from || b.to) {
    if (!(b.from && b.to)) return fail("Intervallo incompleto: servono from e to", 422);
    const from = new Date(b.from);
    const to = new Date(b.to);
    if (!(from < to)) return fail("Intervallo non valido", 422);
    where.startAt = { lt: to };
    where.endAt = { gt: from };
  }

  const quanti = await prisma.block.count({ where });
  if (quanti === 0) return ok({ rimossi: 0, richiestaConferma: false });
  if (quanti > 1 && b.conferma !== true) {
    return fail(`L'operazione rimuove ${quanti} blocchi: ripeti con conferma: true`, 409);
  }

  const r = await prisma.block.deleteMany({ where });
  await registraAzione({
    tenantId: t.tenantId,
    actorId: t.userId,
    azione: "block.delete",
    entita: "Block",
    entitaId: b.boatId ?? "intervallo",
    nota: `rimossi ${r.count} blocchi`,
  });
  return ok({ rimossi: r.count });
}
