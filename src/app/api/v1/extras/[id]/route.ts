import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ePro, pianoDelTenant } from "@/lib/piani";
import { barcheDelTenant } from "@/lib/riferimenti";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

const Schema = z.object({
  nome: z.string().trim().min(2).max(120).optional(),
  prezzo: z.number().min(0).max(100000).optional().nullable(),
  unita: z.enum(["persona", "giorno", "noleggio", "fisso"]).optional(),
  quantitaMax: z.number().int().min(1).max(1000).optional().nullable(),
  boatIds: z.array(z.string().uuid()).max(200).optional(),
  attivo: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  if (!ePro(await pianoDelTenant(t.tenantId))) return fail("La gestione dei servizi extra è del piano Pro", 402);
  const { id } = await params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const cur = await prisma.extra.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!cur) return fail("Servizio non trovato", 404);
  if (p.data.boatIds) {
    const check = await barcheDelTenant(t.tenantId, p.data.boatIds);
    if (!check.ok) return fail("Alcune barche non appartengono a questa azienda", 422);
  }
  return ok(await prisma.extra.update({ where: { id: cur.id }, data: p.data }));
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const cur = await prisma.extra.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!cur) return fail("Servizio non trovato", 404);
  await prisma.extra.delete({ where: { id: cur.id } });
  return ok({ ok: true });
}
