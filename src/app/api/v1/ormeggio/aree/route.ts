import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { codicePosto, requireOrmeggio } from "@/lib/ormeggio";
import { z } from "zod";

const Schema = z.object({
  nome: z.string().min(1).max(80),
  righe: z.number().int().min(1).max(40),
  colonne: z.number().int().min(1).max(40),
  ordine: z.number().int().min(0).max(999).optional(),
});

export async function GET(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const aree = await prisma.area.findMany({
    where: { tenantId: t.tenantId },
    orderBy: [{ ordine: "asc" }, { createdAt: "asc" }],
    include: { posti: { orderBy: [{ riga: "asc" }, { colonna: "asc" }] } },
  });
  return ok(aree);
}

export async function POST(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati area non validi", 422);
  const area = await prisma.area.create({
    data: {
      tenantId: t.tenantId,
      nome: p.data.nome.trim(),
      righe: p.data.righe,
      colonne: p.data.colonne,
      ordine: p.data.ordine ?? 0,
    },
  });
  const posti = [];
  for (let r = 1; r <= p.data.righe; r++) {
    for (let c = 1; c <= p.data.colonne; c++) {
      posti.push({ tenantId: t.tenantId, areaId: area.id, riga: r, colonna: c, codice: codicePosto(r, c) });
    }
  }
  await prisma.posto.createMany({ data: posti });
  await prisma.auditLog.create({
    data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.area.create", entita: "Area", entitaId: area.id },
  });
  return ok({ ...area, postiCount: posti.length }, 201);
}
