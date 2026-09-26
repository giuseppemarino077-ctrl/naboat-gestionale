import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  return ok(await prisma.extra.findMany({ where: { tenantId: t.tenantId }, orderBy: { nome: "asc" } }));
}

export async function POST(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const p = z.object({ nome: z.string().min(2).max(120), prezzo: z.number().min(0).max(100000).optional() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  return ok(await prisma.extra.create({ data: { tenantId: t.tenantId, ...p.data } }), 201);
}
