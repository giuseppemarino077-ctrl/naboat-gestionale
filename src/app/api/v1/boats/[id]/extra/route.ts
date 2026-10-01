import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

async function barca(tenantId: string, id: string) {
  return prisma.boat.findFirst({ where: { id, tenantId }, select: { id: true } });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  if (!(await barca(t.tenantId, id))) return fail("Barca non trovata", 404);
  if (t.vedeImporti === false) return fail("Permesso negato: non hai l'accesso agli importi", 403);
  const [extras, associazioni] = await Promise.all([
    prisma.extra.findMany({ where: { tenantId: t.tenantId }, orderBy: { nome: "asc" } }),
    prisma.extraBarca.findMany({ where: { tenantId: t.tenantId, boatId: id } }),
  ]);
  return ok({ extras, associazioni });
}

const Schema = z.object({
  voci: z.array(z.object({
    extraId: z.string().uuid(),
    associato: z.boolean(),
    prezzoCent: z.number().int().min(0).max(100000000).optional().nullable(),
    quantitaMax: z.number().int().min(0).max(100000).optional().nullable(),
  })).max(80),
}).strict();

// Salva le associazioni extra della sola barca corrente, con override per barca
// (vuoto = eredita il valore base). Mantiene coerente Extra.scope/boatIds.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  if (!(await barca(t.tenantId, id))) return fail("Barca non trovata", 404);
  if (t.vedeImporti === false) return fail("Permesso negato: non hai l'accesso agli importi", 403);
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati extra non validi", 422);

  const validi = await prisma.extra.findMany({ where: { tenantId: t.tenantId, id: { in: p.data.voci.map((v) => v.extraId) } }, select: { id: true } });
  const setValidi = new Set(validi.map((e) => e.id));
  if (p.data.voci.some((v) => !setValidi.has(v.extraId))) return fail("Extra non valido per questa azienda", 422);

  await prisma.$transaction(async (tx) => {
    for (const voce of p.data.voci) {
      if (voce.associato) {
        await tx.extraBarca.upsert({
          where: { extraId_boatId: { extraId: voce.extraId, boatId: id } },
          update: { prezzoCent: voce.prezzoCent ?? null, quantitaMax: voce.quantitaMax ?? null },
          create: { tenantId: t.tenantId, extraId: voce.extraId, boatId: id, prezzoCent: voce.prezzoCent ?? null, quantitaMax: voce.quantitaMax ?? null },
        });
      } else {
        await tx.extraBarca.deleteMany({ where: { tenantId: t.tenantId, extraId: voce.extraId, boatId: id } });
      }
    }

    // Coerenza con la semantica legacy: scope "elenco" + boatIds = barche associate.
    for (const voce of p.data.voci) {
      const barche = await tx.extraBarca.findMany({ where: { tenantId: t.tenantId, extraId: voce.extraId }, select: { boatId: true } });
      const boatIds = barche.map((b) => b.boatId);
      await tx.extra.update({ where: { id: voce.extraId }, data: { boatIds, scope: boatIds.length ? "elenco" : "tutte" } });
    }
  });

  return ok({ ok: true });
}
