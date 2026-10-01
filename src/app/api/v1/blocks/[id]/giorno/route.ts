import { fail, ok } from "@/lib/api";
import { registraAzione } from "@/lib/audit";
import { aggiungiGiorni, inizioGiorno } from "@/lib/calendario";
import { prisma } from "@/lib/db";
import { bloccaRisorse } from "@/lib/disponibilita";
import { requireTenant } from "@/lib/tenant";
import { z } from "zod";

const Schema = z.object({ giorno: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

// Sblocco del solo giorno civile: sottrae [inizioGiorno, inizioGiornoSuccessivo) dal
// blocco, conservando zero/uno/due intervalli residui. Tutto in transazione e sotto
// il lock della barca; nessun intervallo di durata zero.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Giorno non valido", 422);

  const dayStart = inizioGiorno(p.data.giorno);
  const dayEnd = inizioGiorno(aggiungiGiorni(p.data.giorno, 1));

  const esito = await prisma.$transaction(async (tx) => {
    const blocco = await tx.block.findFirst({ where: { id, tenantId: t.tenantId } });
    if (!blocco) return { err: "Blocco non trovato", status: 404 };
    if (!(blocco.startAt < dayEnd && blocco.endAt > dayStart)) return { err: "Il giorno indicato non è coperto dal blocco", status: 409 };

    await bloccaRisorse(tx, { boatIds: [blocco.boatId] });

    await tx.block.delete({ where: { id: blocco.id } });
    const residui: { startAt: Date; endAt: Date }[] = [];
    if (blocco.startAt < dayStart) residui.push({ startAt: blocco.startAt, endAt: dayStart });
    if (dayEnd < blocco.endAt) residui.push({ startAt: dayEnd, endAt: blocco.endAt });
    for (const r of residui) {
      await tx.block.create({ data: { tenantId: t.tenantId, boatId: blocco.boatId, startAt: r.startAt, endAt: r.endAt, motivo: blocco.motivo } });
    }
    await tx.auditLog.create({
      data: {
        tenantId: t.tenantId, actorId: t.userId, azione: "block.libera_giorno", entita: "Block", entitaId: blocco.id,
        dettagli: JSON.stringify({ giorno: p.data.giorno, residui: residui.length }),
      },
    });
    return { residui: residui.length };
  });

  if ("err" in esito && esito.err) return fail(esito.err, esito.status ?? 422);
  await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: "block.libera_giorno", entita: "Block", entitaId: id, nota: p.data.giorno });
  return ok({ residui: (esito as { residui: number }).residui });
}
