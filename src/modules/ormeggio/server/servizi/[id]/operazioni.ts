import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/modules/ormeggio/accesso";
import { z } from "zod";

const Schema = z.object({
  nome: z.string().trim().min(1).max(80).optional(),
  prezzoCent: z.number().int().min(0).max(100000000).optional().nullable(),
  unita: z.string().max(20).optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati servizio non validi", 422);
  if (p.data.prezzoCent !== undefined && t.vedeImporti === false) return fail("Permesso negato: non hai l'accesso agli importi", 403);
  const s = await prisma.servizioCatalogo.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!s) return fail("Servizio non trovato", 404);
  const aggiornato = await prisma.servizioCatalogo.update({ where: { id: s.id }, data: p.data });
  return ok(t.vedeImporti === false ? { ...aggiornato, prezzoCent: null } : aggiornato);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const eliminati = await prisma.servizioCatalogo.deleteMany({ where: { id, tenantId: t.tenantId } });
  if (!eliminati.count) return fail("Servizio non trovato", 404);
  return ok({ ok: true });
}
