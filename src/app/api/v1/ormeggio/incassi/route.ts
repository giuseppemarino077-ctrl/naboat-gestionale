import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/lib/ormeggio";
import { z } from "zod";

// Incasso esterno (contanti, POS, bonifico) registrato a mano dall'operatore.
// È distinto dall'addebito: l'addebito è la voce da pagare, l'incasso è il denaro ricevuto.
export async function GET(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const permanenzaId = new URL(req.url).searchParams.get("permanenzaId");
  const incassi = await prisma.payment.findMany({
    where: { tenantId: t.tenantId, ...(permanenzaId ? { permanenzaId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return ok(incassi);
}

const Schema = z.object({
  permanenzaId: z.string().uuid(),
  importoCent: z.number().int().min(1).max(100000000),
  metodo: z.string().max(40).optional().nullable(),
  descrizione: z.string().max(200).optional().nullable(),
});

export async function POST(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati incasso non validi", 422);
  const perm = await prisma.permanenza.findFirst({ where: { id: p.data.permanenzaId, tenantId: t.tenantId } });
  if (!perm) return fail("Permanenza non trovata", 404);
  const incasso = await prisma.payment.create({
    data: {
      tenantId: t.tenantId,
      permanenzaId: perm.id,
      provider: "manuale",
      tipo: "totale",
      importoCent: p.data.importoCent,
      totaleCent: p.data.importoCent,
      stato: "pagato",
      metodo: p.data.metodo?.trim() || "manuale",
      descrizione: p.data.descrizione?.trim() || null,
      paidAt: new Date(),
    },
  });
  await prisma.auditLog.create({
    data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.incasso.manuale", entita: "Permanenza", entitaId: perm.id },
  });
  return ok(incasso, 201);
}
