import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";
import { rigeneraAzienda } from "@/lib/seo";
import { z } from "zod";

export async function GET() {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: true, boats: true, bookings: true } } },
  });
  return ok(tenants);
}

const PatchSchema = z.object({
  id: z.string().uuid(),
  azione: z.enum(["approve", "suspend", "reactivate", "reject"]),
});

export async function PATCH(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => null);
  const p = PatchSchema.safeParse(body);
  if (!p.success) return fail("Richiesta non valida", 422);

  // Rifiuto: elimina tenant pending e tutto ciò che contiene (cascade)
  if (p.data.azione === "reject") {
    const cur = await prisma.tenant.findUnique({ where: { id: p.data.id } });
    if (!cur) return fail("Tenant non trovato", 404);
    if (cur.status !== "pending") return fail("Solo i pending si possono rifiutare (usa sospendi/elimina)", 422);
    await prisma.tenant.delete({ where: { id: cur.id } });
    return ok({ id: cur.id, status: "rejected" });
  }

  const status = p.data.azione === "approve" || p.data.azione === "reactivate" ? "active" : "suspended";
  const tenant = await prisma.tenant.update({ where: { id: p.data.id }, data: { status } }).catch(() => null);
  if (!tenant) return fail("Tenant non trovato", 404);
  await prisma.auditLog.create({
    data: { tenantId: tenant.id, actorId: g.session.sub, azione: `tenant.${p.data.azione}`, entita: "Tenant", entitaId: tenant.id },
  });
  // Approvando l'azienda si prepara anche la sua pagina pubblica (SEO) dai dati reali.
  if (status === "active") await rigeneraAzienda(tenant.id).catch(() => {});
  return ok({ id: tenant.id, status: tenant.status });
}

// Eliminazione tenant (con tutto il contenuto via cascade). Azione irreversibile.
export async function DELETE(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("Parametro id obbligatorio", 422);
  const cur = await prisma.tenant.findUnique({ where: { id } });
  if (!cur) return fail("Tenant non trovato", 404);
  await prisma.tenant.delete({ where: { id } });
  return ok({ id, status: "deleted" });
}
