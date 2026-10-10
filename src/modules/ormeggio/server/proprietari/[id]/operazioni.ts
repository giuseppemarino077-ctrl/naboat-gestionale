import { z } from "zod";
import { Prisma } from "@prisma/client";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/modules/ormeggio/accesso";
import { dedupProprietario } from "@/modules/ormeggio/regole";

const Schema = z.object({
  nome: z.string().trim().min(1).max(160),
  telefono: z.string().trim().max(40).nullable(),
  email: z.string().trim().email().max(160).nullable(),
  note: z.string().trim().max(1000).nullable(),
}).strict();
type Context = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Context) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const proprietario = await prisma.proprietario.findFirst({
    where: { id, tenantId: t.tenantId, archiviato: false },
    select: {
      id: true, nome: true, telefono: true, email: true,
      boats: {
        where: { tenantId: t.tenantId, uso: "custodia", archiviato: false },
        orderBy: { nome: "asc" },
        select: {
          id: true, nome: true,
          permanenze: {
            where: { tenantId: t.tenantId },
            orderBy: { inizioAt: "desc" },
            select: {
              id: true, stato: true, inizioAt: true, finePrevistaAt: true, fineAt: true,
              posto: { select: { codice: true, area: { select: { nome: true, archiviata: true } } } },
            },
          },
        },
      },
    },
  });
  return proprietario ? ok(proprietario) : fail("Proprietario non trovato", 404);
}

export async function PATCH(req: Request, { params }: Context) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Controlla nome e recapiti del proprietario", 422);
  const data = { ...p.data, telefono: p.data.telefono || null, email: p.data.email?.toLowerCase() || null, note: p.data.note || null };
  try {
    const result = await prisma.$transaction(async (tx) => {
      const changed = await tx.proprietario.updateMany({ where: { id, tenantId: t.tenantId, archiviato: false }, data: { ...data, dedupKey: dedupProprietario(data) } });
      if (!changed.count) return null;
      await tx.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.proprietario.update", entita: "Proprietario", entitaId: id } });
      return tx.proprietario.findFirst({ where: { id, tenantId: t.tenantId } });
    });
    return result ? ok(result) : fail("Proprietario non trovato", 404);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail("Esiste già un proprietario con questi recapiti", 409);
    throw e;
  }
}

export async function DELETE(req: Request, { params }: Context) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Proprietario" WHERE id = ${id} AND "tenantId" = ${t.tenantId} FOR UPDATE`;
    const owner = await tx.proprietario.findFirst({ where: { id, tenantId: t.tenantId, archiviato: false } });
    if (!owner) return null;
    const now = new Date();
    const boats = await tx.boat.findMany({ where: { tenantId: t.tenantId, proprietarioId: id, uso: "custodia" }, select: { id: true } });
    const boatIds = boats.map((b) => b.id);
    const scope = { tenantId: t.tenantId, boatId: { in: boatIds } };
    await tx.assegnazionePosto.deleteMany({ where: { ...scope, dal: { gte: now } } });
    await tx.assegnazionePosto.updateMany({ where: { ...scope, dal: { lt: now }, OR: [{ al: null }, { al: { gt: now } }] }, data: { al: now } });
    const stays = await tx.permanenza.findMany({ where: { ...scope, stato: "attiva" }, select: { id: true, inizioAt: true } });
    for (const stay of stays) await tx.permanenza.updateMany({ where: { id: stay.id, tenantId: t.tenantId }, data: { stato: "chiusa", fineAt: stay.inizioAt > now ? stay.inizioAt : now } });
    await tx.movimento.deleteMany({ where: { ...scope, effettivoAt: null, previstoAt: { gte: now } } });
    await tx.boat.updateMany({ where: { tenantId: t.tenantId, id: { in: boatIds } }, data: { archiviato: true, pubblicata: false } });
    await tx.proprietario.updateMany({ where: { id, tenantId: t.tenantId }, data: { archiviato: true, dedupKey: `eliminato:${id}` } });
    await tx.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.proprietario.delete", entita: "Proprietario", entitaId: id, dettagli: JSON.stringify({ barcheRimosse: boatIds.length, sosteChiuse: stays.length }) } });
    return { ok: true, barcheRimosse: boatIds.length };
  });
  return result ? ok(result) : fail("Proprietario non trovato", 404);
}
