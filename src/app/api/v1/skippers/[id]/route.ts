import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { isOwnerOrSuperadmin, requireTenant } from "@/lib/tenant";
import { z } from "zod";

const Schema = z.object({
  nome: z.string().min(2).max(120).optional(),
  telefono: z.string().max(40).optional().nullable(),
  attivo: z.boolean().optional(),
  // Collega (o scollega) l'utente che accede al portale con questa scheda skipper
  userId: z.string().uuid().optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);

  const skipper = await prisma.skipper.findFirst({ where: { id, tenantId: t.tenantId }, select: { id: true } });
  if (!skipper) return fail("Skipper non trovato", 404);

  if (p.data.userId !== undefined && p.data.userId !== null) {
    if (!isOwnerOrSuperadmin(t.role)) return fail("Riservato al proprietario", 403);
    const u = await prisma.user.findFirst({ where: { id: p.data.userId, tenantId: t.tenantId, role: "skipper" }, select: { id: true } });
    if (!u) return fail("Utente skipper non valido per questa azienda", 422);
  }

  const { userId, ...resto } = p.data;
  await prisma.skipper.updateMany({ where: { id, tenantId: t.tenantId }, data: resto });
  if (userId !== undefined) {
    await prisma.skipper.update({ where: { id }, data: { userId } });
  }
  return ok({ ok: true, collegato: userId ?? null });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const uso = await prisma.booking.count({ where: { skipperId: id, tenantId: t.tenantId, stato: { in: ["prenotata", "in_mare"] } } });
  if (uso > 0) return fail("Skipper assegnato a prenotazioni attive", 409);
  const r = await prisma.skipper.deleteMany({ where: { id, tenantId: t.tenantId } });
  if (!r.count) return fail("Skipper non trovato", 404);
  return ok({ ok: true });
}
