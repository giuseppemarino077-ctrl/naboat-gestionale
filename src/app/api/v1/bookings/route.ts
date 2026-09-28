import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { parseImportoEuro } from "@/lib/payments";
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
  extraQuantita: z.record(z.string(), z.number().int().min(1).max(1000)).optional(),
  idempotencyKey: z.string().max(80).optional(),
  stato: z.enum(["da_confermare", "prenotata"]).default("prenotata"),
  prezzoEuro: z.string().max(20).optional().nullable(),
  pagato: z.boolean().optional(),
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

  // Tempo di preparazione fra due noleggi della stessa barca (pulizia/rifornimento),
  // configurabile da NaBoat. Si allarga la finestra di controllo su entrambi i lati.
  const impostazioni = await prisma.platformSettings.findUnique({ where: { id: "singleton" }, select: { tempoPreparazioneMin: true } }).catch(() => null);
  const prepMs = Math.max(0, impostazioni?.tempoPreparazioneMin ?? 0) * 60000;
  const startAllargato = new Date(start.getTime() - prepMs);
  const endAllargato = new Date(end.getTime() + prepMs);

  const dedupKey = normTel(v.telefono);
  const prezzoCent = v.prezzoEuro ? parseImportoEuro(v.prezzoEuro) : null;
  if (v.prezzoEuro && prezzoCent === null) return fail("Prezzo non valido", 422);

  // Tutto in transazione, con un lock per barca: due addetti che salvano nello stesso
  // istante non possono superare insieme il controllo (il trigger del database resta il secondo livello).
  let risultato: { err?: string; booking?: any };
  try {
    risultato = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${v.boatId}))`;

      const overlap = await tx.booking.findFirst({
        where: { boatId: v.boatId, tenantId: t.tenantId, stato: { in: ["da_confermare", "prenotata", "in_mare"] }, startAt: { lt: endAllargato }, endAt: { gt: startAllargato } },
        select: { id: true },
      });
      if (overlap) return { err: prepMs > 0 ? "Sovrapposizione con altra prenotazione (o troppo vicina: serve il tempo di preparazione)" : "Sovrapposizione con altra prenotazione" };
      const block = await tx.block.findFirst({
        where: { boatId: v.boatId, tenantId: t.tenantId, startAt: { lt: endAllargato }, endAt: { gt: startAllargato } },
        select: { id: true, motivo: true },
      });
      if (block) return { err: `Risorsa bloccata${block.motivo ? `: ${block.motivo}` : ""}` };

      const customer = await tx.customer.upsert({
        where: { tenantId_dedupKey: { tenantId: t.tenantId, dedupKey } },
        update: { nome: v.clienteNome, ...(v.email ? { email: v.email } : {}) },
        create: { tenantId: t.tenantId, nome: v.clienteNome, telefono: v.telefono, email: v.email, dedupKey },
      });

      const booking = await tx.booking.create({
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
          stato: v.stato,
          ...(prezzoCent !== null ? { prezzoCent } : {}),
          skipperId: v.skipperId || undefined,
          idempotencyKey: v.idempotencyKey,
          extras: { create: v.extraIds.map((id) => ({ extraId: id, quantita: v.extraQuantita?.[id] ?? 1 })) },
        },
        include: { boat: { select: { nome: true } }, skipper: { select: { nome: true } } },
      });
      return { booking };
    });
  } catch (e) {
    if (/Sovrapposizione/i.test(e instanceof Error ? e.message : String(e))) return fail("Sovrapposizione con altra prenotazione", 409);
    throw e;
  }

  if (risultato.err) return fail(risultato.err, 409);

  // Prenotazione manuale già pagata: si registra un incasso distinto dal noleggio online.
  if (v.pagato && prezzoCent !== null && risultato.booking) {
    await prisma.payment.create({
      data: {
        tenantId: t.tenantId,
        bookingId: risultato.booking.id,
        provider: "manuale",
        tipo: "saldo",
        importoCent: prezzoCent,
        totaleCent: prezzoCent,
        stato: "pagato",
        metodo: "manuale",
        descrizione: "Incasso registrato a mano (prenotazione rapida)",
        paidAt: new Date(),
      },
    });
  }

  return ok(risultato.booking, 201);
}
