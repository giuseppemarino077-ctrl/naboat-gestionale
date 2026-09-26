import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/lib/ormeggio";
import { z } from "zod";

// Movimenti: uscite programmate/effettive, rientri e trasferimenti.
export async function GET(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const url = new URL(req.url);
  const permanenzaId = url.searchParams.get("permanenzaId");
  const dataStr = url.searchParams.get("data");
  const dal = dataStr ? new Date(`${dataStr}T00:00:00`) : null;
  const al = dataStr ? new Date(`${dataStr}T23:59:59`) : null;

  const movimenti = await prisma.movimento.findMany({
    where: {
      tenantId: t.tenantId,
      ...(permanenzaId ? { permanenzaId } : {}),
      ...(dal && al ? { OR: [{ effettivoAt: { gte: dal, lte: al } }, { previstoAt: { gte: dal, lte: al } }] } : {}),
    },
    orderBy: [{ effettivoAt: "desc" }, { previstoAt: "desc" }, { createdAt: "desc" }],
    include: {
      permanenza: { include: { boat: { select: { nome: true } }, posto: { select: { codice: true } } } },
    },
    take: 300,
  });
  return ok(movimenti);
}

const Schema = z.object({
  permanenzaId: z.string().uuid(),
  tipo: z.enum(["uscita_programmata", "uscita", "rientro", "trasferimento"]),
  previstoAt: z.string().nullable().optional(),
  effettivoAt: z.string().nullable().optional(),
  note: z.string().max(1000).optional().nullable(),
});

export async function POST(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati movimento non validi", 422);
  const perm = await prisma.permanenza.findFirst({ where: { id: p.data.permanenzaId, tenantId: t.tenantId } });
  if (!perm) return fail("Permanenza non trovata", 404);
  const adesso = new Date();
  const effettivoAt = p.data.effettivoAt ? new Date(p.data.effettivoAt) : p.data.tipo === "uscita_programmata" ? null : adesso;
  const movimento = await prisma.movimento.create({
    data: {
      tenantId: t.tenantId,
      permanenzaId: perm.id,
      boatId: perm.boatId,
      tipo: p.data.tipo,
      previstoAt: p.data.previstoAt ? new Date(p.data.previstoAt) : null,
      effettivoAt,
      note: p.data.note?.trim() || null,
    },
  });
  await prisma.auditLog.create({
    data: { tenantId: t.tenantId, actorId: t.userId, azione: `ormeggio.movimento.${p.data.tipo}`, entita: "Permanenza", entitaId: perm.id },
  });
  return ok(movimento, 201);
}
