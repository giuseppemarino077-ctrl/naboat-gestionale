import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ePro, pianoDelTenant } from "@/lib/piani";
import { barcheDelTenant } from "@/lib/riferimenti";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Servizi extra del noleggio: prezzo, unità (persona/giorno/noleggio/fisso),
// quantità massima e barche su cui sono disponibili. La gestione extra è del piano Pro.
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  return ok(await prisma.extra.findMany({ where: { tenantId: t.tenantId }, orderBy: { nome: "asc" } }));
}

const Schema = z.object({
  nome: z.string().trim().min(2).max(120),
  prezzo: z.number().min(0).max(100000).optional(),
  unita: z.enum(["persona", "giorno", "noleggio", "fisso"]).default("noleggio"),
  quantitaMax: z.number().int().min(1).max(1000).optional().nullable(),
  boatIds: z.array(z.string().uuid()).max(200).optional(),
});

export async function POST(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  if (!ePro(await pianoDelTenant(t.tenantId))) return fail("La gestione dei servizi extra è del piano Pro", 402);
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  if (p.data.boatIds) {
    const check = await barcheDelTenant(t.tenantId, p.data.boatIds);
    if (!check.ok) return fail("Alcune barche non appartengono a questa azienda", 422);
  }
  return ok(await prisma.extra.create({ data: { tenantId: t.tenantId, ...p.data } }), 201);
}
