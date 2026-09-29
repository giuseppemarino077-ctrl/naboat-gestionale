import { fail, ok } from "@/lib/api";
import { registraAzione } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { bloccaRisorse, verificaDisponibilita } from "@/lib/disponibilita";
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
  if (start >= end) return fail("Orari incoherenti", 422);

  // In transazione con il lock per barca: non si inserisce un blocco sopra una
  // prenotazione o un altro blocco mentre un'altra richiesta sta salvando.
  let risultato: { err?: string; status?: number; block?: any };
  try {
    risultato = await prisma.$transaction(async (tx) => {
      await bloccaRisorse(tx, { boatIds: [p.data.boatId] });

      const boat = await tx.boat.findFirst({ where: { id: p.data.boatId, tenantId: t.tenantId }, select: { id: true } });
      if (!boat) return { err: "Barca non trovata", status: 404 };

      const disp = await verificaDisponibilita(tx, { tenantId: t.tenantId, boatId: p.data.boatId, startAt: start, endAt: end });
      if (!disp.ok) {
        const messaggio = disp.motivo === "barca" ? "Esiste una prenotazione nel periodo" : disp.motivo === "blocco" ? "Esiste già un blocco nel periodo" : disp.messaggio;
        return { err: messaggio, status: 409 };
      }

      const block = await tx.block.create({ data: { tenantId: t.tenantId, boatId: p.data.boatId, startAt: start, endAt: end, motivo: p.data.motivo } });
      return { block };
    });
  } catch (e) {
    if (/Sovrapposizione/i.test(e instanceof Error ? e.message : String(e))) return fail("Esiste una prenotazione nel periodo", 409);
    throw e;
  }
  if (risultato.err) return fail(risultato.err, risultato.status ?? 409);
  return ok(risultato.block, 201);
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
