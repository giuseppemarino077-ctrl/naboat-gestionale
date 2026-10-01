import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";
import { Prisma } from "@prisma/client";
import { z } from "zod";

function isP2002(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

function parseEuro(v: string): number | null {
  const n = Math.round(Number(String(v).trim().replace(",", ".")) * 100);
  return Number.isFinite(n) && n >= 0 && n <= 100000000 ? n : null;
}

const Schema = z.object({
  azione: z.enum(["esegui", "riapri"]),
  costoEuro: z.string().max(20).optional().nullable(),
  costoPrevistoEuro: z.string().max(20).optional().nullable(),
  dataIntervento: z.string().max(40).optional().nullable(),
});

// Segna un intervento come eseguito (e registra/aggiorna la spesa collegata) oppure lo riapre.
// Il collegamento per id (Expense.maintenanceId) distingue interventi omonimi e rende
// idempotente il completamento: ripetere «esegui» non crea una seconda spesa.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await ctx.params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Richiesta non valida", 422);

  const item = await prisma.maintenance.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!item) return fail("Intervento non trovato", 404);

  if (p.data.azione === "riapri") {
    // Riaprire annulla l'intervento: la spesa collegata non ha più ragione d'essere.
    const upd = await prisma.$transaction(async (tx) => {
      await tx.expense.deleteMany({ where: { tenantId: t.tenantId, maintenanceId: item.id } });
      return tx.maintenance.update({ where: { id: item.id }, data: { eseguitoAt: null } });
    });
    return ok(upd);
  }

  const quando = p.data.dataIntervento ? new Date(p.data.dataIntervento) : new Date();
  if (Number.isNaN(quando.getTime())) return fail("Data intervento non valida", 422);

  // Costo effettivo: quello indicato ora, altrimenti quello già memorizzato.
  let costoCent = item.costoCent;
  if (p.data.costoEuro) {
    const n = parseEuro(p.data.costoEuro);
    if (n === null) return fail("Costo non valido", 422);
    costoCent = n;
  }

  let costoPrevistoCent = item.costoPrevistoCent;
  if (p.data.costoPrevistoEuro) {
    const n = parseEuro(p.data.costoPrevistoEuro);
    if (n === null) return fail("Costo previsto non valido", 422);
    costoPrevistoCent = n;
  }

  try {
    const upd = await prisma.$transaction(async (tx) => {
      const salvato = await tx.maintenance.update({
        where: { id: item.id },
        data: { eseguitoAt: quando, costoCent, costoPrevistoCent },
      });
      const esistente = await tx.expense.findUnique({ where: { maintenanceId: item.id }, select: { id: true } });
      if (costoCent && costoCent > 0) {
        const dati = {
          tenantId: t.tenantId,
          boatId: item.boatId,
          categoria: "manutenzione" as const,
          descrizione: `Manutenzione: ${item.titolo}`,
          importoCent: costoCent,
          data: quando,
          note: "Generata dall'intervento in Manutenzione",
          creatoDa: t.userId,
        };
        if (esistente) await tx.expense.update({ where: { id: esistente.id }, data: { ...dati, maintenanceId: item.id } });
        else await tx.expense.create({ data: { ...dati, maintenanceId: item.id } });
      } else if (esistente) {
        await tx.expense.delete({ where: { id: esistente.id } });
      }
      // Manutenzione bloccante conclusa prima del previsto: si libera la barca dal
      // momento della conclusione, conservando lo storico dell'intervallo trascorso.
      const blocco = await tx.block.findFirst({ where: { maintenanceId: item.id, tenantId: t.tenantId }, select: { id: true, endAt: true } });
      if (blocco && quando < blocco.endAt) {
        await tx.block.update({ where: { id: blocco.id }, data: { endAt: quando, versione: { increment: 1 } } });
      }
      return salvato;
    });
    return ok(upd);
  } catch (e) {
    if (isP2002(e)) {
      // Un'altra richiesta ha già registrato la spesa: si rilegge lo stato.
      const corrente = await prisma.maintenance.findFirst({ where: { id: item.id, tenantId: t.tenantId } });
      return ok(corrente);
    }
    throw e;
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await ctx.params;
  const item = await prisma.maintenance.findFirst({ where: { id, tenantId: t.tenantId }, select: { id: true } });
  if (!item) return fail("Intervento non trovato", 404);
  // Si rimuove anche il blocco collegato (se esiste) per non lasciare blocchi orfani;
  // la spesa segue l'intervento (FK ON DELETE CASCADE).
  await prisma.$transaction(async (tx) => {
    await tx.block.deleteMany({ where: { maintenanceId: item.id, tenantId: t.tenantId } });
    await tx.maintenance.delete({ where: { id: item.id } });
  });
  return ok({ id: item.id, eliminato: true });
}
