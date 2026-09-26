import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/lib/ormeggio";
import { z } from "zod";

const Schema = z.object({
  bloccato: z.boolean().optional(),
  lunghezzaMaxCm: z.number().int().min(0).max(100000).optional().nullable(),
  larghezzaMaxCm: z.number().int().min(0).max(100000).optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati posto non validi", 422);
  const posto = await prisma.posto.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!posto) return fail("Posto non trovato", 404);
  const aggiornato = await prisma.posto.update({ where: { id: posto.id }, data: p.data });
  return ok(aggiornato);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const posto = await prisma.posto.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!posto) return fail("Posto non trovato", 404);
  const usi = await prisma.permanenza.count({ where: { tenantId: t.tenantId, postoId: posto.id } });
  if (usi > 0) return fail("Posto con permanenze registrate: non eliminabile", 409);
  await prisma.posto.delete({ where: { id: posto.id } });
  return ok({ ok: true });
}
