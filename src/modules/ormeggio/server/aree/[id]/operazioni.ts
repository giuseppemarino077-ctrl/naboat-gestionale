import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/modules/ormeggio/accesso";
import { codicePosto } from "@/modules/ormeggio/regole";
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
  const risultato = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Area" WHERE id = ${id} AND "tenantId" = ${t.tenantId} FOR UPDATE`;
    const area = await tx.area.findFirst({ where: { id, tenantId: t.tenantId, archiviata: false } });
    if (!area) return null;
    const righe = p.data.righe ?? area.righe;
    const colonne = p.data.colonne ?? area.colonne;
    const aggiornata = await tx.area.update({ where: { id: area.id, tenantId: t.tenantId }, data: { ...p.data, ...(p.data.nome ? { nome: p.data.nome.trim() } : {}) } });
    const posti = [];
    for (let r = 1; r <= righe; r++) for (let c = 1; c <= colonne; c++) posti.push({ tenantId: t.tenantId, areaId: area.id, riga: r, colonna: c, codice: codicePosto(r, c) });
    await tx.posto.createMany({ data: posti, skipDuplicates: true });
    await tx.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.area.modifica", entita: "Area", entitaId: aggiornata.id, dettagli: JSON.stringify({ prima: { righe: area.righe, colonne: area.colonne }, dopo: { righe, colonne } }) } });
    return aggiornata;
  });
  return risultato ? ok(risultato) : fail("Area non trovata", 404);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const rimossa = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Area" WHERE id = ${id} AND "tenantId" = ${t.tenantId} FOR UPDATE`;
    const area = await tx.area.findFirst({ where: { id, tenantId: t.tenantId, archiviata: false } });
    if (!area) return false;
    await tx.area.update({ where: { id: area.id, tenantId: t.tenantId }, data: { archiviata: true } });
    await tx.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.area.elimina", entita: "Area", entitaId: area.id, dettagli: JSON.stringify({ nome: area.nome, storicoConservato: true }) } });
    return true;
  });
  return rimossa ? ok({ ok: true }) : fail("Area non trovata", 404);
}
