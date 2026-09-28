import { fail, ok } from "@/lib/api";
import { registraAzione } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { requireImporti } from "@/lib/ormeggio";
import { z } from "zod";

const Schema = z.object({
  stato: z.enum(["da_pagare", "pagato"]).optional(),
  descrizione: z.string().min(1).max(160).optional(),
  importoCent: z.number().int().min(0).max(100000000).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireImporti(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati addebito non validi", 422);
  const ad = await prisma.addebito.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!ad) return fail("Addebito non trovato", 404);
  const aggiornato = await prisma.addebito.update({ where: { id: ad.id }, data: p.data });
  await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.addebito.modifica", entita: "Addebito", entitaId: ad.id, nota: ad.descrizione });
  return ok(aggiornato);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireImporti(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const ad = await prisma.addebito.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!ad) return fail("Addebito non trovato", 404);
  await prisma.addebito.delete({ where: { id: ad.id } });
  await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.addebito.elimina", entita: "Addebito", entitaId: ad.id, nota: ad.descrizione });
  return ok({ ok: true });
}
