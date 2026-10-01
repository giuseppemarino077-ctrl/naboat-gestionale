import { fail, ok } from "@/lib/api";
import { registraAzione } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { bloccaRisorse, verificaDisponibilita } from "@/lib/disponibilita";
import { requireTenant } from "@/lib/tenant";
import { z } from "zod";

export async function GET(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams;
  const where: any = { tenantId: t.tenantId };
  if (q.get("boatId")) where.boatId = q.get("boatId");
  // Filtro per intersezione (non per solo inizio): un blocco ancora rilevante non
  // sparisce perché iniziato prima della finestra richiesta.
  const from = q.get("from");
  const to = q.get("to");
  if (from && to) {
    const f = new Date(from);
    const tt = new Date(to);
    if (Number.isNaN(f.getTime()) || Number.isNaN(tt.getTime()) || !(f < tt)) return fail("Intervallo non valido", 422);
    where.startAt = { lt: tt };
    where.endAt = { gt: f };
  }
  return ok(await prisma.block.findMany({ where, orderBy: { startAt: "asc" }, take: 500, include: { boat: { select: { nome: true } } } }));
}

const Schema = z.object({
  boatId: z.string().min(1),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  motivo: z.string().max(1000).optional(),
  // Se selezionata, l'indisponibilità è una manutenzione: si crea, nella stessa
  // transazione, il blocco e l'intervento collegato.
  manutenzione: z.boolean().default(false),
  idempotencyKey: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati blocco non validi", 422);
  const start = new Date(p.data.startAt);
  const end = new Date(p.data.endAt);
  if (start >= end) return fail("Orari incoherenti", 422);

  // In transazione con il lock per barca: non si inserisce un blocco sopra una
  // prenotazione o un altro blocco mentre un'altra richiesta sta salvando.
  let risultato: { err?: string; status?: number; block?: unknown };
  try {
    risultato = await prisma.$transaction(async (tx) => {
      await bloccaRisorse(tx, { boatIds: [p.data.boatId] });

      const boat = await tx.boat.findFirst({ where: { id: p.data.boatId, tenantId: t.tenantId }, select: { id: true, eliminazioneRichiestaAt: true } });
      if (!boat) return { err: "Barca non trovata", status: 404 };
      if (boat.eliminazioneRichiestaAt) return { err: "Barca in fase di rimozione", status: 409 };

      const disp = await verificaDisponibilita(tx, { tenantId: t.tenantId, boatId: p.data.boatId, startAt: start, endAt: end });
      if (!disp.ok) {
        const messaggio = disp.motivo === "barca" ? "Esiste una prenotazione nel periodo" : disp.motivo === "blocco" ? "Esiste già un blocco nel periodo" : disp.messaggio;
        return { err: messaggio, status: 409 };
      }

      // Retry/doppio clic: se lo stesso intervallo della barca è già bloccato la
      // verifica sopra risponde 409 e non si crea un doppione. Con la manutenzione
      // i due record nascono insieme o non nascono affatto.
      const block = await tx.block.create({
        data: { tenantId: t.tenantId, boatId: p.data.boatId, startAt: start, endAt: end, motivo: p.data.motivo },
      });
      if (p.data.manutenzione) {
        const manutenzione = await tx.maintenance.create({
          data: {
            tenantId: t.tenantId,
            boatId: p.data.boatId,
            tipo: "altro",
            titolo: "Manutenzione programmata",
            dataScadenza: end,
            note: p.data.motivo ?? null,
          },
          select: { id: true },
        });
        const collegato = await tx.block.update({ where: { id: block.id }, data: { maintenanceId: manutenzione.id } });
        await tx.auditLog.create({
          data: { tenantId: t.tenantId, actorId: t.userId, azione: "block.manutenzione", entita: "Block", entitaId: block.id, dettagli: JSON.stringify({ maintenanceId: manutenzione.id }) },
        });
        return { block: collegato };
      }
      return { block };
    });
  } catch (e) {
    if (/Sovrapposizione/i.test(e instanceof Error ? e.message : String(e))) return fail("Esiste una prenotazione nel periodo", 409);
    throw e;
  }
  if (risultato.err) return fail(risultato.err, risultato.status ?? 409);
  await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: "block.create", entita: "Block", entitaId: (risultato.block as { id: string }).id, nota: p.data.manutenzione ? "manutenzione collegata" : undefined });
  return ok(risultato.block, 201);
}

// Eliminazione di un blocco o di un gruppo di blocchi.
// Un corpo vuoto o malformato non deve MAI cancellare l'intero archivio:
// serve un identificativo, una barca oppure un intervallo from/to completo.
// Le cancellazioni multiple richiedono conferma esplicita e vengono tracciate.
const DeleteSchema = z
  .object({
    id: z.string().min(1).optional(),
    boatId: z.string().min(1).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    conferma: z.boolean().optional(),
  })
  .strict();

export async function DELETE(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;

  const p = DeleteSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Richiesta di eliminazione non valida", 422);
  const b = p.data;

  if (b.id) {
    const r = await prisma.block.deleteMany({ where: { id: b.id, tenantId: t.tenantId } });
    if (r.count === 0) return fail("Blocco non trovato", 404);
    await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: "block.delete", entita: "Block", entitaId: b.id });
    return ok({ rimossi: r.count });
  }

  if (!b.boatId && !(b.from && b.to)) {
    return fail("Specificare id, boatId oppure un intervallo from/to", 422);
  }

  const where: any = { tenantId: t.tenantId };
  if (b.boatId) {
    const boat = await prisma.boat.findFirst({ where: { id: b.boatId, tenantId: t.tenantId }, select: { id: true } });
    if (!boat) return fail("Barca non trovata", 404);
    where.boatId = b.boatId;
  }
  if (b.from || b.to) {
    if (!(b.from && b.to)) return fail("Intervallo incompleto: servono from e to", 422);
    const from = new Date(b.from);
    const to = new Date(b.to);
    if (!(from < to)) return fail("Intervallo non valido", 422);
    where.startAt = { lt: to };
    where.endAt = { gt: from };
  }

  const quanti = await prisma.block.count({ where });
  if (quanti === 0) return ok({ rimossi: 0, richiestaConferma: false });
  if (quanti > 1 && b.conferma !== true) {
    return fail(`L'operazione rimuove ${quanti} blocchi: ripeti con conferma: true`, 409);
  }

  const r = await prisma.block.deleteMany({ where });
  await registraAzione({
    tenantId: t.tenantId,
    actorId: t.userId,
    azione: "block.delete",
    entita: "Block",
    entitaId: b.boatId ?? "intervallo",
    nota: `rimossi ${r.count} blocchi`,
  });
  return ok({ rimossi: r.count });
}
