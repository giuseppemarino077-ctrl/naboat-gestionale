import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/modules/ormeggio/accesso";
import { oggi, inizioGiorno, aggiungiGiorni } from "@/modules/piattaforma/date";
import { z } from "zod";

// Movimenti: uscite programmate/effettive, rientri e trasferimenti.
export async function GET(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const url = new URL(req.url);
  const permanenzaId = url.searchParams.get("permanenzaId");
  const limitato = t.role !== "owner" && t.ruoloOrmeggio === "addetto";
  const dataStr = url.searchParams.get("data") ?? (limitato ? oggi() : null);
  if (limitato && dataStr && dataStr < oggi()) return fail("Storico non disponibile per il tuo profilo", 403);
  if (dataStr && (!/^\d{4}-\d{2}-\d{2}$/.test(dataStr) || Number.isNaN(+new Date(dataStr)))) return fail("Data non valida", 422);
  const dal = dataStr ? inizioGiorno(dataStr) : null;
  const al = dataStr ? inizioGiorno(aggiungiGiorni(dataStr, 1)) : null;

  const movimenti = await prisma.movimento.findMany({
    where: {
      tenantId: t.tenantId,
      ...(permanenzaId ? { permanenzaId } : { permanenza: { boat: { archiviato: false } } }),
      ...(dal && al ? { OR: [{ effettivoAt: { gte: dal, lt: al } }, { previstoAt: { gte: dal, lt: al } }] } : {}),
    },
    orderBy: [{ effettivoAt: "desc" }, { previstoAt: "desc" }, { createdAt: "desc" }],
    include: {
      permanenza: { select: { id: true, boat: { select: { nome: true } }, posto: { select: { codice: true } } } },
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
  const perm = await prisma.permanenza.findFirst({ where: { id: p.data.permanenzaId, tenantId: t.tenantId, boat: { archiviato: false } } });
  if (!perm) return fail("Permanenza non trovata", 404);
  if (perm.stato !== "attiva") return fail("La permanenza è chiusa", 409);
  if (t.role !== "owner" && t.ruoloOrmeggio === "addetto" && p.data.tipo === "trasferimento") return fail("Usa lo spostamento dalla mappa", 422);
  for (const value of [p.data.previstoAt, p.data.effettivoAt]) if (value && Number.isNaN(+new Date(value))) return fail("Data movimento non valida", 422);
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
