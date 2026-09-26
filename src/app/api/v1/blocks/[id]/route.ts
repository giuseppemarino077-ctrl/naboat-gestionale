import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

// Rimozione puntuale di un blocco
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const r = await prisma.block.deleteMany({ where: { id, tenantId: t.tenantId } });
  if (!r.count) return fail("Blocco non trovato", 404);
  return ok({ ok: true });
}
