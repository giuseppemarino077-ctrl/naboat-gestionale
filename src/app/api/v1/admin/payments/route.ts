import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";
import { z } from "zod";

// NaBoat: elenco dello stato pagamenti delle aziende e possibilità di disattivarli (RFQ D4).
export async function GET() {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const tenants = await prisma.tenant.findMany({
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      status: true,
      pagamentiAttivi: true,
      pagamentiBloccatiNaBoat: true,
      stripeAttivo: true,
      paypalAttivo: true,
      feeNaboatPct: true,
      _count: { select: { payments: true } },
    },
  });
  const incassi = await prisma.payment.groupBy({
    by: ["tenantId", "stato"],
    _sum: { totaleCent: true, feeNaboatCent: true },
  });
  return ok(
    tenants.map((t) => ({
      ...t,
      incassi: incassi
        .filter((i) => i.tenantId === t.id)
        .map((i) => ({
          stato: i.stato,
          totaleCent: i._sum.totaleCent ?? 0,
          feeNaboatCent: i._sum.feeNaboatCent ?? 0,
        })),
    }))
  );
}

const Schema = z.object({
  id: z.string().uuid(),
  azione: z.enum(["blocca", "sblocca"]),
});

export async function PATCH(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Richiesta non valida", 422);

  const tenant = await prisma.tenant
    .update({
      where: { id: p.data.id },
      data: { pagamentiBloccatiNaBoat: p.data.azione === "blocca" },
      select: { id: true, nome: true, pagamentiBloccatiNaBoat: true },
    })
    .catch(() => null);
  if (!tenant) return fail("Azienda non trovata", 404);
  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      actorId: g.session.sub,
      azione: `pagamenti.${p.data.azione}`,
      entita: "Tenant",
      entitaId: tenant.id,
    },
  });
  return ok(tenant);
}
