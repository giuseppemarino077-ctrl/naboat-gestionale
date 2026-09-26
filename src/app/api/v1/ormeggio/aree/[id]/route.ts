import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { codicePosto, requireOrmeggio } from "@/lib/ormeggio";
import { z } from "zod";

const Schema = z.object({
  nome: z.string().min(1).max(80).optional(),
  righe: z.number().int().min(1).max(40).optional(),
  colonne: z.number().int().min(1).max(40).optional(),
  ordine: z.number().int().min(0).max(999).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati area non validi", 422);
  const area = await prisma.area.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!area) return fail("Area non trovata", 404);

  const aggiornata = await prisma.area.update({
    where: { id: area.id },
    data: { ...p.data, ...(p.data.nome ? { nome: p.data.nome.trim() } : {}) },
  });

  // Allargando la griglia si aggiungono i posti mancanti: quelli esistenti non si toccano
  // (potrebbero avere permanenze e storico).
  const posti = [];
  for (let r = 1; r <= aggiornata.righe; r++) {
    for (let c = 1; c <= aggiornata.colonne; c++) {
      posti.push({ tenantId: t.tenantId, areaId: aggiornata.id, riga: r, colonna: c, codice: codicePosto(r, c) });
    }
  }
  await prisma.posto.createMany({ data: posti, skipDuplicates: true });

  await prisma.auditLog.create({
    data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.area.modifica", entita: "Area", entitaId: aggiornata.id },
  });
  return ok(aggiornata);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const area = await prisma.area.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!area) return fail("Area non trovata", 404);
  const usi = await prisma.permanenza.count({ where: { tenantId: t.tenantId, posto: { areaId: area.id } } });
  if (usi > 0) return fail("Area con permanenze registrate: non eliminabile", 409);
  await prisma.area.delete({ where: { id: area.id } });
  await prisma.auditLog.create({
    data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.area.elimina", entita: "Area", entitaId: area.id },
  });
  return ok({ ok: true });
}
