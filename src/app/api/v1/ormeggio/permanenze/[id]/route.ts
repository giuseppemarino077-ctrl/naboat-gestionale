import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { FINE_APERTA, conflittoPermanenza, requireOrmeggio } from "@/lib/ormeggio";
import { z } from "zod";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const permanenza = await prisma.permanenza.findFirst({
    where: { id, tenantId: t.tenantId },
    include: {
      boat: { include: { proprietario: true } },
      posto: { include: { area: { select: { nome: true } } } },
      attivita: { orderBy: { createdAt: "asc" }, include: { addetto: { select: { id: true, nome: true } } } },
      addebiti: { orderBy: { data: "asc" } },
      movimenti: { orderBy: [{ effettivoAt: "desc" }, { createdAt: "desc" }] },
      payments: { orderBy: { createdAt: "desc" } },
      contratto: true,
    },
  });
  if (!permanenza) return fail("Permanenza non trovata", 404);
  const totaleAddebitiCent = permanenza.addebiti.reduce((s, a) => s + a.importoCent, 0);
  const incassatoCent = permanenza.payments.filter((p) => p.stato === "pagato").reduce((s, p) => s + p.totaleCent, 0);
  return ok({ ...permanenza, conto: { totaleAddebitiCent, incassatoCent, residuoCent: Math.max(0, totaleAddebitiCent - incassatoCent) } });
}

const Patch = z.object({
  azione: z.enum(["chiudi", "sposta", "aggiorna"]),
  fineAt: z.string().optional(),
  postoId: z.string().uuid().optional(),
  decorrenza: z.string().optional(),
  finePrevistaAt: z.string().nullable().optional(),
  corrispettivoCent: z.number().int().min(0).max(100000000).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const cur = await prisma.permanenza.findFirst({ where: { id, tenantId: t.tenantId }, include: { posto: true } });
  if (!cur) return fail("Permanenza non trovata", 404);

  if (p.data.azione === "chiudi") {
    if (cur.stato === "chiusa") return fail("Permanenza già chiusa", 409);
    const fineAt = p.data.fineAt ? new Date(p.data.fineAt) : new Date();
    const aggiornata = await prisma.permanenza.update({ where: { id: cur.id }, data: { fineAt, stato: "chiusa" } });
    await prisma.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.permanenza.chiudi", entita: "Permanenza", entitaId: cur.id } });
    return ok(aggiornata);
  }

  if (p.data.azione === "aggiorna") {
    const finePrev = p.data.finePrevistaAt ? new Date(p.data.finePrevistaAt) : p.data.finePrevistaAt === null ? null : cur.finePrevistaAt;
    const aggiornata = await prisma.permanenza.update({
      where: { id: cur.id },
      data: {
        finePrevistaAt: finePrev,
        ...(p.data.corrispettivoCent !== undefined ? { corrispettivoCent: p.data.corrispettivoCent } : {}),
        ...(p.data.note !== undefined ? { note: p.data.note?.trim() || null } : {}),
      },
    });
    return ok(aggiornata);
  }

  // sposta: conserva lo storico e libera il posto precedente.
  if (!p.data.postoId) return fail("Indicare il nuovo posto", 422);
  const nuovo = await prisma.posto.findFirst({ where: { id: p.data.postoId, tenantId: t.tenantId } });
  if (!nuovo) return fail("Posto non trovato", 404);
  if (nuovo.bloccato) return fail("Posto non utilizzabile", 409);
  if (nuovo.id === cur.postoId) return fail("La barca è già in questo posto", 409);

  const fine = cur.finePrevistaAt ?? FINE_APERTA;
  const conflitto = await prisma.permanenza.count({
    where: {
      tenantId: t.tenantId,
      id: { not: cur.id },
      postoId: nuovo.id,
      stato: "attiva",
      inizioAt: { lte: fine },
      OR: [{ fineAt: { gte: cur.inizioAt } }, { fineAt: null, finePrevistaAt: null }, { fineAt: null, finePrevistaAt: { gte: cur.inizioAt } }],
    },
  });
  if (conflitto > 0) return fail("Il nuovo posto è occupato in questo periodo", 409);

  const decorrenza = p.data.decorrenza ? new Date(p.data.decorrenza) : new Date();
  await prisma.movimento.create({
    data: {
      tenantId: t.tenantId,
      permanenzaId: cur.id,
      boatId: cur.boatId,
      tipo: "trasferimento",
      previstoAt: decorrenza,
      effettivoAt: decorrenza,
      note: `Da ${cur.posto.codice} a ${nuovo.codice}`,
    },
  });
  const aggiornata = await prisma.permanenza.update({ where: { id: cur.id }, data: { postoId: nuovo.id } }).catch((e) => {
    if (conflittoPermanenza(e)) return null;
    throw e;
  });
  if (!aggiornata) return fail("Il nuovo posto è occupato in questo periodo", 409);
  await prisma.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.permanenza.sposta", entita: "Permanenza", entitaId: cur.id } });
  return ok(aggiornata);
}
