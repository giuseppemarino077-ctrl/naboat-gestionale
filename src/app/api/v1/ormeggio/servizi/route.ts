import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/lib/ormeggio";
import { z } from "zod";

export async function GET(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const servizi = await prisma.servizioCatalogo.findMany({ where: { tenantId: t.tenantId }, orderBy: { nome: "asc" } });
  return ok(servizi);
}

const Schema = z.object({
  nome: z.string().min(1).max(80),
  prezzoCent: z.number().int().min(0).max(100000000).optional().nullable(),
  unita: z.string().max(20).optional().nullable(),
});

export async function POST(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati servizio non validi", 422);
  const servizio = await prisma.servizioCatalogo.create({
    data: { tenantId: t.tenantId, nome: p.data.nome.trim(), prezzoCent: p.data.prezzoCent ?? null, unita: p.data.unita?.trim() || null },
  });
  return ok(servizio, 201);
}
