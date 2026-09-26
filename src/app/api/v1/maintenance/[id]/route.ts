import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

const Schema = z.object({
  azione: z.enum(["esegui", "riapri"]),
  costoEuro: z.string().max(20).optional().nullable(),
  dataIntervento: z.string().max(40).optional().nullable(),
});

// Segna un intervento come eseguito (e, se c'è un costo, lo registra tra le spese) oppure lo riapre.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await ctx.params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Richiesta non valida", 422);

  const item = await prisma.maintenance.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!item) return fail("Intervento non trovato", 404);

  if (p.data.azione === "riapri") {
    const upd = await prisma.maintenance.update({
      where: { id: item.id },
      data: { eseguitoAt: null },
    });
    return ok(upd);
  }

  const quando = p.data.dataIntervento ? new Date(p.data.dataIntervento) : new Date();
  if (Number.isNaN(quando.getTime())) return fail("Data intervento non valida", 422);

  let costoCent = item.costoCent;
  if (p.data.costoEuro) {
    const n = Math.round(Number(String(p.data.costoEuro).trim().replace(",", ".")) * 100);
    if (!Number.isFinite(n) || n < 0) return fail("Costo non valido", 422);
    costoCent = n;
  }

  const upd = await prisma.maintenance.update({
    where: { id: item.id },
    data: { eseguitoAt: quando, costoCent },
  });

  // Il costo sostenuto diventa una spesa nel resoconto (una sola volta).
  if (costoCent && costoCent > 0) {
    const esistente = await prisma.expense.findFirst({
      where: { tenantId: t.tenantId, descrizione: `Manutenzione: ${item.titolo}`, boatId: item.boatId },
      select: { id: true },
    });
    if (!esistente) {
      await prisma.expense.create({
        data: {
          tenantId: t.tenantId,
          boatId: item.boatId,
          categoria: "manutenzione",
          descrizione: `Manutenzione: ${item.titolo}`,
          importoCent: costoCent,
          data: quando,
          note: "Generata dall'intervento in Manutenzione",
          creatoDa: t.userId,
        },
      });
    }
  }

  return ok(upd);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await ctx.params;
  const item = await prisma.maintenance.findFirst({ where: { id, tenantId: t.tenantId }, select: { id: true } });
  if (!item) return fail("Intervento non trovato", 404);
  await prisma.maintenance.delete({ where: { id: item.id } });
  return ok({ id: item.id, eliminato: true });
}
