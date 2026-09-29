import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { leggiPaginazione, rispostaPaginata } from "@/lib/paginazione";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Spese di gestione dell'azienda (carburante, manutenzione, skipper, assicurazione…).
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  if (t.vedeImporti === false) return fail("Permesso negato: non hai l'accesso agli importi", 403);
  const q = new URL(req.url).searchParams;
  const where: Record<string, unknown> = { tenantId: t.tenantId };
  if (q.get("boatId")) where.boatId = q.get("boatId");
  if (q.get("categoria")) where.categoria = q.get("categoria");
  if (q.get("from") || q.get("to")) {
    where.data = {
      ...(q.get("from") ? { gte: new Date(q.get("from")!) } : {}),
      ...(q.get("to") ? { lte: new Date(q.get("to")!) } : {}),
    };
  }
  // Conteggio e finestra dal database: nessun filtro o taglio in memoria.
  const pag = leggiPaginazione(q, 500);
  const [totale, list] = await Promise.all([
    prisma.expense.count({ where }),
    prisma.expense.findMany({
      where,
      orderBy: { data: "desc" },
      skip: pag.salta,
      take: pag.dimensione,
      include: { boat: { select: { nome: true } } },
    }),
  ]);
  return rispostaPaginata(list, totale, pag);
}

const CATEGORIE = [
  "carburante",
  "manutenzione",
  "skipper",
  "assicurazione",
  "ormeggio",
  "pulizia",
  "commissioni",
  "altro",
] as const;

const Schema = z.object({
  boatId: z.string().uuid().optional().nullable(),
  categoria: z.enum(CATEGORIE).default("altro"),
  descrizione: z.string().min(1).max(200),
  importoEuro: z.string().min(1).max(20),
  data: z.string().min(1).max(40),
  note: z.string().max(1000).optional().nullable(),
});

function parseEuro(v: string): number | null {
  const n = Math.round(Number(String(v).trim().replace(",", ".")) * 100);
  return Number.isFinite(n) && n > 0 && n <= 100000000 ? n : null;
}

export async function POST(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  if (t.vedeImporti === false) return fail("Permesso negato: non hai l'accesso agli importi", 403);
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati spesa non validi", 422);

  const importoCent = parseEuro(p.data.importoEuro);
  if (importoCent === null) return fail("Importo non valido", 422);
  const data = new Date(p.data.data);
  if (Number.isNaN(data.getTime())) return fail("Data non valida", 422);

  if (p.data.boatId) {
    const b = await prisma.boat.findFirst({ where: { id: p.data.boatId, tenantId: t.tenantId }, select: { id: true } });
    if (!b) return fail("Barca non trovata", 404);
  }

  const expense = await prisma.expense.create({
    data: {
      tenantId: t.tenantId,
      boatId: p.data.boatId || null,
      categoria: p.data.categoria,
      descrizione: p.data.descrizione,
      importoCent,
      data,
      note: p.data.note ?? null,
      creatoDa: t.userId,
    },
  });
  await prisma.auditLog.create({
    data: { tenantId: t.tenantId, actorId: t.userId, azione: "spesa.creata", entita: "Expense", entitaId: expense.id },
  });
  return ok(expense, 201);
}

export async function DELETE(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  if (t.vedeImporti === false) return fail("Permesso negato: non hai l'accesso agli importi", 403);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("Parametro id obbligatorio", 422);
  const cur = await prisma.expense.findFirst({ where: { id, tenantId: t.tenantId }, select: { id: true } });
  if (!cur) return fail("Spesa non trovata", 404);
  await prisma.expense.delete({ where: { id: cur.id } });
  await prisma.auditLog.create({
    data: { tenantId: t.tenantId, actorId: t.userId, azione: "spesa.eliminata", entita: "Expense", entitaId: cur.id },
  });
  return ok({ id: cur.id, eliminata: true });
}
