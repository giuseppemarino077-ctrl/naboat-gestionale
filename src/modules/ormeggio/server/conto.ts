import { prisma } from "@/lib/db";
import { calcolaConto } from "@/modules/ormeggio/conto";

export async function contoPermanenza(tenantId: string, permanenzaId: string) {
  const [addebiti, payments] = await Promise.all([
    prisma.addebito.findMany({ where: { tenantId, permanenzaId } }),
    prisma.payment.findMany({ where: { tenantId, permanenzaId }, include: { refunds: { where: { tenantId } } } }),
  ]);
  return calcolaConto(addebiti, payments);
}

export async function vociConto(tenantId: string, permanenzaIds: string[]) {
  const conti = await prisma.permanenza.findMany({ where: { tenantId, id: { in: [...new Set(permanenzaIds)] } }, select: { addebiti: { where: { tenantId } }, payments: { where: { tenantId }, include: { refunds: { where: { tenantId } } } } } });
  return new Map(conti.flatMap((c) => calcolaConto(c.addebiti, c.payments).addebiti.map((a) => [a.id, a] as const)));
}
