import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

const Schema = z.object({
  nome: z.string().trim().min(2).max(120).optional(),
  indirizzo: z.string().trim().max(240).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lon: z.number().min(-180).max(180).optional().nullable(),
  note: z.string().trim().max(600).optional().nullable(),
  orari: z.string().trim().max(240).optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati del porto non validi", 422);
  const cur = await prisma.porto.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!cur) return fail("Porto non trovato", 404);
  const aggiornato = await prisma.porto.update({ where: { id: cur.id }, data: p.data });
  await prisma.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "porto.modifica", entita: "Porto", entitaId: cur.id } });
  return ok(aggiornato);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const cur = await prisma.porto.findFirst({ where: { id, tenantId: t.tenantId }, include: { _count: { select: { boats: true } } } });
  if (!cur) return fail("Porto non trovato", 404);
  await prisma.porto.delete({ where: { id: cur.id } });
  await prisma.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "porto.elimina", entita: "Porto", entitaId: cur.id } });
  return ok({ ok: true });
}
