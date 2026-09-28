import { fail, ok } from "@/lib/api";
import { registraAzione } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/lib/ormeggio";
import { z } from "zod";

const Schema = z.object({
  stato: z.enum(["da_fare", "in_corso", "completato"]).optional(),
  addettoId: z.string().uuid().optional().nullable(),
  quantita: z.number().min(0).max(100000).optional().nullable(),
  prezzoCent: z.number().int().min(0).max(100000000).optional().nullable(),
  incluso: z.boolean().optional(),
  note: z.string().max(1000).optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati attività non validi", 422);
  const att = await prisma.attivita.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!att) return fail("Attività non trovata", 404);

  const completato = p.data.stato === "completato";
  const aggiornata = await prisma.attivita.update({
    where: { id: att.id },
    data: {
      ...(p.data.stato ? { stato: p.data.stato } : {}),
      ...(p.data.addettoId !== undefined ? { addettoId: p.data.addettoId } : {}),
      ...(p.data.quantita !== undefined ? { quantita: p.data.quantita } : {}),
      ...(p.data.prezzoCent !== undefined ? { prezzoCent: p.data.prezzoCent } : {}),
      ...(p.data.incluso !== undefined ? { incluso: p.data.incluso } : {}),
      ...(p.data.note !== undefined ? { note: p.data.note?.trim() || null } : {}),
      ...(completato ? { completatoAt: att.completatoAt ?? new Date() } : {}),
    },
  });

  // Al completamento nasce UNA sola voce di conto (i servizi inclusi non generano extra).
  if (completato && !aggiornata.incluso && aggiornata.prezzoCent) {
    const esistente = await prisma.addebito.findFirst({ where: { tenantId: t.tenantId, attivitaId: att.id } });
    if (!esistente) {
      const importo = Math.round(aggiornata.prezzoCent * (aggiornata.quantita ?? 1));
      const origine = /carburante|benzina|gasolio/i.test(aggiornata.tipo) ? "carburante" : "servizio";
      await prisma.addebito.create({
        data: {
          tenantId: t.tenantId,
          permanenzaId: aggiornata.permanenzaId,
          descrizione: aggiornata.tipo,
          importoCent: importo,
          origine,
          attivitaId: att.id,
        },
      });
    }
  }
  await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: p.data.stato ? `ormeggio.attivita.${p.data.stato}` : "ormeggio.attivita.modifica", entita: "Attivita", entitaId: att.id, nota: aggiornata.tipo });
  return ok(aggiornata);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const att = await prisma.attivita.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!att) return fail("Attività non trovata", 404);
  const addebiti = await prisma.addebito.count({ where: { tenantId: t.tenantId, attivitaId: att.id } });
  if (addebiti > 0) return fail("Attività con addebito collegato: non eliminabile", 409);
  await prisma.attivita.delete({ where: { id: att.id } });
  await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.attivita.elimina", entita: "Attivita", entitaId: att.id, nota: att.tipo });
  return ok({ ok: true });
}
