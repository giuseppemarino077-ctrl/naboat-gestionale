import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { CATALOGO_PREDEFINITO } from "@/lib/dotazioni";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Catalogo dotazioni dell'azienda. Se l'azienda non ha ancora personalizzato il
// catalogo, si restituisce quello predefinito (non salvato) come punto di partenza.
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const salvate = await prisma.dotazione.findMany({ where: { tenantId: t.tenantId }, orderBy: [{ categoria: "asc" }, { ordine: "asc" }, { nome: "asc" }] });
  if (salvate.length) return ok(salvate);
  return ok(CATALOGO_PREDEFINITO.map((d, i) => ({ id: null, tenantId: t.tenantId, categoria: d.categoria, nome: d.nome, descrizione: d.descrizione ?? null, ordine: i })));
}

const Schema = z.object({
  nome: z.string().min(1).max(120),
  categoria: z.enum(["NAVIGATION", "COMFORT", "ENTERTAINMENT", "KITCHEN", "ELECTRICAL", "WATER_SPORTS", "OTHER"]).default("OTHER"),
  descrizione: z.string().max(300).optional().nullable(),
}).strict();

export async function POST(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati dotazione non validi", 422);
  const dot = await prisma.dotazione.upsert({
    where: { tenantId_nome: { tenantId: t.tenantId, nome: p.data.nome } },
    update: { categoria: p.data.categoria, descrizione: p.data.descrizione ?? null },
    create: { tenantId: t.tenantId, nome: p.data.nome, categoria: p.data.categoria, descrizione: p.data.descrizione ?? null },
  });
  return ok(dot, 201);
}
