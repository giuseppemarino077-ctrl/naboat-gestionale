import { fail, ok } from "@/lib/api";
import { registraAzione } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

// Rimozione puntuale di un blocco. Se il blocco è collegato a una manutenzione
// creata insieme a esso (e non ci sono altri blocchi dello stesso intervento),
// la manutenzione viene rimossa con il blocco: lo sblocco è completo.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const { id } = await params;

  const esito = await prisma.$transaction(async (tx) => {
    const blocco = await tx.block.findFirst({ where: { id, tenantId: t.tenantId }, select: { id: true, maintenanceId: true } });
    if (!blocco) return { trovato: false as const };

    await tx.block.delete({ where: { id: blocco.id } });

    let manutenzioneRimossa = false;
    if (blocco.maintenanceId) {
      const altri = await tx.block.count({ where: { maintenanceId: blocco.maintenanceId, tenantId: t.tenantId } });
      if (altri === 0) {
        const r = await tx.maintenance.deleteMany({ where: { id: blocco.maintenanceId, tenantId: t.tenantId } });
        manutenzioneRimossa = r.count > 0;
      }
    }
    return { trovato: true as const, manutenzioneRimossa };
  });

  if (!esito.trovato) return fail("Blocco non trovato", 404);
  await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: "block.delete", entita: "Block", entitaId: id, nota: esito.manutenzioneRimossa ? "manutenzione collegata rimossa" : undefined });
  return ok({ ok: true, manutenzioneRimossa: esito.manutenzioneRimossa });
}
