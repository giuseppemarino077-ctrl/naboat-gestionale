import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

const normTel = (s: string) => s.replace(/\D/g, "").slice(-15);

export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams;
  const where: any = { tenantId: t.tenantId };
  if (q.get("from")) where.startAt = { ...(where.startAt ?? {}), gte: new Date(q.get("from")!) };
  if (q.get("to")) where.endAt = { ...(where.endAt ?? {}), lte: new Date(q.get("to")!) };
  if (q.get("boatId")) where.boatId = q.get("boatId");
  if (q.get("stato")) where.stato = q.get("stato");
  const list = await prisma.booking.findMany({
    where,
    orderBy: { startAt: "asc" },
    take: 200,
    include: { boat: { select: { nome: true } }, skipper: { select: { nome: true } }, extras: { include: { extra: true } } },
  });
  return ok(list);
}

const Schema = z.object({
  boatId: z.string().min(1),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  passeggeri: z.number().int().min(1).max(60).default(2),
  clienteNome: z.string().min(1).max(120),
  telefono: z.string().min(4).max(40),
  email: z.string().email().max(160).optional(),
  destinazione: z.string().max(120).optional(),
  formula: z.string().max(120).optional(),
  note: z.string().max(2000).optional(),
  patenteOk: z.boolean().default(false),
  skipperId: z.string().optional(),
  extraIds: z.array(z.string()).max(20).default([]),
  idempotencyKey: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati prenotazione non validi", 422);
  const v = p.data;
  const start = new Date(v.startAt);
  const end = new Date(v.endAt);
  if (start >= end) return fail("Orari incoerenti", 422);

  if (v.idempotencyKey) {
    const dup = await prisma.booking.findUnique({ where: { idempotencyKey: v.idempotencyKey } });
    if (dup && dup.tenantId === t.tenantId) return ok(dup);
    if (dup) return fail("Chiave idempotenza già usata", 409);
  }

  const boat = await prisma.boat.findFirst({ where: { id: v.boatId, tenantId: t.tenantId } });
  if (!boat) return fail("Barca non trovata", 404);
  if (boat.stato === "manutenzione") return fail("Barca in manutenzione", 422);
  if (v.passeggeri > boat.capienza) return fail(`Capienza max ${boat.capienza}`, 422);
  if (boat.patenteRichiesta && !v.patenteOk && !v.skipperId) return fail("Patente richiesta: indicare patente oppure skipper", 422);
  if (v.skipperId) {
    const sk = await prisma.skipper.findFirst({ where: { id: v.skipperId, tenantId: t.tenantId, attivo: true } });
    if (!sk) return fail("Skipper non valido", 422);
  }

  const overlap = await prisma.booking.findFirst({
    where: { boatId: v.boatId, tenantId: t.tenantId, stato: { in: ["prenotata", "in_mare"] }, startAt: { lt: end }, endAt: { gt: start } },
    select: { id: true },
  });
  if (overlap) return fail("Sovrapposizione con altra prenotazione", 409);
  const block = await prisma.block.findFirst({
    where: { boatId: v.boatId, tenantId: t.tenantId, startAt: { lt: end }, endAt: { gt: start } },
    select: { id: true, motivo: true },
  });
  if (block) return fail(`Risorsa bloccata${block.motivo ? `: ${block.motivo}` : ""}`, 409);

  const dedupKey = normTel(v.telefono);
  const customer = await prisma.customer.upsert({
    where: { tenantId_dedupKey: { tenantId: t.tenantId, dedupKey } },
    update: { nome: v.clienteNome, ...(v.email ? { email: v.email } : {}) },
    create: { tenantId: t.tenantId, nome: v.clienteNome, telefono: v.telefono, email: v.email, dedupKey },
  });

  const booking = await prisma.booking.create({
    data: {
      tenantId: t.tenantId,
      boatId: v.boatId,
      customerId: customer.id,
      startAt: start,
      endAt: end,
      passeggeri: v.passeggeri,
      clienteNome: v.clienteNome,
      telefono: v.telefono,
      destinazione: v.destinazione,
      formula: v.formula,
      note: v.note,
      patenteOk: v.patenteOk,
      skipperId: v.skipperId || undefined,
      idempotencyKey: v.idempotencyKey,
      extras: { create: v.extraIds.map((id) => ({ extraId: id })) },
    },
    include: { boat: { select: { nome: true } }, skipper: { select: { nome: true } } },
  });
  return ok(booking, 201);
}
