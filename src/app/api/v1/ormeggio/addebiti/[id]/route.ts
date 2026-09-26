import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/lib/ormeggio";
import { z } from "zod";

const Schema = z.object({
  stato: z.enum(["da_pagare", "pagato"]).optional(),
  descrizione: z.string().min(1).max(160).optional(),
  importoCent: z.number().int().min(0).max(100000000).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati addebito non validi", 422);
  const ad = await prisma.addebito.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!ad) return fail("Addebito non trovato", 404);
  const aggiornato = await prisma.addebito.update({ where: { id: ad.id }, data: p.data });
  return ok(aggiornato);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const ad = await prisma.addebito.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!ad) return fail("Addebito non trovato", 404);
  await prisma.addebito.delete({ where: { id: ad.id } });
  return ok({ ok: true });
}
