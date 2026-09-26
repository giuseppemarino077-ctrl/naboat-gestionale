import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = z.object({
    nome: z.string().min(2).max(120).optional(),
    telefono: z.string().min(4).max(40).optional(),
    email: z.string().email().max(160).optional().nullable(),
    note: z.string().max(2000).optional().nullable(),
  }).safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const r = await prisma.customer.updateMany({ where: { id, tenantId: t.tenantId }, data: p.data });
  if (!r.count) return fail("Cliente non trovato", 404);
  return ok({ ok: true });
}
