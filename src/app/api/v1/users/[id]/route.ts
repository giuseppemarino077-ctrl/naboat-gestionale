import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { isOwnerOrSuperadmin, requireTenant } from "@/lib/tenant";
import { z } from "zod";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  if (!isOwnerOrSuperadmin(t.role)) return fail("Riservato al proprietario", 403);
  const { id } = await params;
  if (id === t.userId) return fail("Non puoi modificare il tuo ruolo", 422);
  const p = z.object({ nome: z.string().min(2).max(120).optional(), role: z.enum(["operatore", "skipper"]).optional(), vedeImporti: z.boolean().optional() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const r = await prisma.user.updateMany({ where: { id, tenantId: t.tenantId }, data: p.data as any });
  if (!r.count) return fail("Utente non trovato", 404);
  return ok({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  if (!isOwnerOrSuperadmin(t.role)) return fail("Riservato al proprietario", 403);
  const { id } = await params;
  if (id === t.userId) return fail("Non puoi eliminare te stesso", 422);
  const target = await prisma.user.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!target) return fail("Utente non trovato", 404);
  if (target.role === "owner") {
    const owners = await prisma.user.count({ where: { tenantId: t.tenantId, role: "owner" } });
    if (owners <= 1) return fail("Deve restare almeno un proprietario", 422);
  }
  await prisma.user.delete({ where: { id: target.id } });
  return ok({ ok: true });
}
