import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { ePro, pianoDelTenant } from "@/modules/piattaforma/piani-commerciali";
import { barcheDelTenant } from "@/modules/piattaforma/riferimenti";
import { requireAziendaNoleggio } from "@/modules/noleggio/accesso";

import { z } from "zod";

// Servizi extra del noleggio: prezzo, unità (persona/giorno/noleggio/fisso),
// quantità massima e barche su cui sono disponibili. La gestione extra è del piano Pro.
export async function GET(req: Request) {
  const t = await requireAziendaNoleggio(req);
  if ("error" in t) return t.error;
  if (t.vedeImporti === false) return fail("Permesso negato: non hai l'accesso agli importi", 403);
  return ok(await prisma.extra.findMany({ where: { tenantId: t.tenantId }, orderBy: { nome: "asc" } }));
}

const Schema = z.object({
  nome: z.string().trim().min(2).max(120),
  descrizione: z.string().max(500).optional().nullable(),
  prezzo: z.number().min(0).max(100000).optional(),
  unita: z.enum(["persona", "giorno", "noleggio", "fisso", "per_ora", "per_unita"]).default("noleggio"),
  quantitaMax: z.number().int().min(1).max(1000).optional().nullable(),
  boatIds: z.array(z.string().uuid()).max(200).optional(),
});

export async function POST(req: Request) {
  const t = await requireAziendaNoleggio(req);
  if ("error" in t) return t.error;
  if (t.vedeImporti === false) return fail("Permesso negato: non hai l'accesso agli importi", 403);
  if (!ePro(await pianoDelTenant(t.tenantId))) return fail("La gestione dei servizi extra è del piano Pro", 402);
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  if (p.data.boatIds) {
    const check = await barcheDelTenant(t.tenantId, p.data.boatIds);
    if (!check.ok) return fail("Alcune barche non appartengono a questa azienda", 422);
  }
  return ok(await prisma.extra.create({ data: { tenantId: t.tenantId, ...p.data } }), 201);
}
