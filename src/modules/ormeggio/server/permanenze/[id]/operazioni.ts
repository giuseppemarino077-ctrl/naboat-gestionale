import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireImportiOrmeggio, requireOrmeggio } from "@/modules/ormeggio/accesso";
import { postoNelQuadro, conflittoPermanenza } from "@/modules/ormeggio/regole";
import { dataSosta, periodoOccupato, sovrapposizioneAssegnazioni } from "@/modules/ormeggio/periodi";
import { z } from "zod";

function conflittoAssegnazione(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /23P01/.test(msg) || /exclusion constraint/i.test(msg) || /assegnazione_(posto|barca)_senza_sovrapposizioni/.test(msg);
}
class Conflitto extends Error {}
class PeriodoNonValido extends Error {}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const permanenza = await prisma.permanenza.findFirst({
    where: { id, tenantId: t.tenantId },
    include: {
      boat: { include: { proprietario: true } },
      posto: { include: { area: true } },
      attivita: { orderBy: { createdAt: "asc" }, include: { addetto: { select: { id: true, nome: true } }, addebito: { select: { id: true, importoCent: true } } } },
      addebiti: { orderBy: { data: "asc" } },
      movimenti: { orderBy: [{ effettivoAt: "desc" }, { createdAt: "desc" }] },
      assegnazioni: { orderBy: { dal: "asc" } },
      payments: { orderBy: { createdAt: "desc" } },
      contratto: true,
    },
  });
  if (!permanenza) return fail("Permanenza non trovata", 404);
  const postoFuoriGriglia = !postoNelQuadro(permanenza.posto);
  const totaleAddebitiCent = permanenza.addebiti.reduce((s, a) => s + a.importoCent, 0);
  const incassatoCent = permanenza.payments.filter((p) => p.stato === "pagato").reduce((s, p) => s + p.totaleCent, 0);
  // Senza il permesso sugli importi la scheda resta consultabile, ma senza cifre.
  // Il contratto porta snapshot con importi, quindi non va restituito.
  if (t.vedeImporti === false) {
    return ok({
      ...permanenza,
      postoFuoriGriglia,
      corrispettivoCent: null,
      attivita: permanenza.attivita.map((a) => ({ ...a, contabilizzata: !!a.addebito, completamentoRiservato: !a.incluso && !!a.prezzoCent, prezzoCent: null, addebito: null })),
      addebiti: [],
      payments: [],
      contratto: null,
      conto: null,
    });
  }
  return ok({ ...permanenza, postoFuoriGriglia, conto: { totaleAddebitiCent, incassatoCent, residuoCent: Math.max(0, totaleAddebitiCent - incassatoCent) } });
}

const Patch = z.object({
  azione: z.enum(["chiudi", "sposta", "aggiorna"]),
  fineAt: z.string().optional(),
  postoId: z.string().uuid().optional(),
  decorrenza: z.string().optional(),
  finePrevistaAt: z.string().nullable().optional(),
  corrispettivoCent: z.number().int().min(0).max(100000000).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
  pronta: z.boolean().optional(),
  // La modifica del corrispettivo è sempre una rettifica esplicita del conto.
  rettifica: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const cur = await prisma.permanenza.findFirst({ where: { id, tenantId: t.tenantId }, include: { posto: true, boat: { select: { proprietarioId: true } } } });
  if (!cur) return fail("Permanenza non trovata", 404);

  if (p.data.azione === "chiudi") {
    if (cur.stato === "chiusa") return fail("Permanenza già chiusa", 409);
    const fineAt = p.data.fineAt ? dataSosta(p.data.fineAt) : new Date();
    if (!fineAt) return fail("Data di chiusura non valida", 422);
    if (fineAt <= cur.inizioAt) return fail("La chiusura deve essere successiva all'inizio", 422);
    // L'assegnazione "corrente" è l'ultima della catena (anche se ha già una fine prevista).
    const aperta = await prisma.assegnazionePosto.findFirst({ where: { tenantId: t.tenantId, permanenzaId: cur.id }, orderBy: { dal: "desc" } });
    if (aperta && fineAt <= aperta.dal) return fail("La chiusura è precedente all'ultimo spostamento", 422);
    try {
      const aggiornata = await prisma.$transaction(async (tx) => {
        // Se il posto è già stato riassegnato a un'altra permanenza, l'occupazione
        // di questa si chiude lì: non si creano sovrapposizioni.
        let alChiusura = fineAt;
        if (aperta) {
          const successiva = await tx.assegnazionePosto.findFirst({
            where: { tenantId: t.tenantId, postoId: cur.postoId, permanenzaId: { not: cur.id }, dal: { lt: fineAt } },
            orderBy: { dal: "asc" },
            select: { dal: true },
          });
          if (successiva && successiva.dal > aperta.dal) alChiusura = successiva.dal;
        }
        const upd = await tx.permanenza.update({ where: { id: cur.id }, data: { fineAt, stato: "chiusa" } });
        // Chiude l'assegnazione corrente: il posto torna libero, la storia resta.
        if (aperta) await tx.assegnazionePosto.update({ where: { id: aperta.id }, data: { al: alChiusura } });
        await tx.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.permanenza.chiudi", entita: "Permanenza", entitaId: cur.id } });
        return upd;
      });
      return ok(aggiornata);
    } catch (e) {
      if (conflittoAssegnazione(e)) return fail("Conflitto sull'assegnazione del posto", 409);
      throw e;
    }
  }

  if (p.data.azione === "aggiorna") {
    // Modificare il corrispettivo è un'operazione economica e richiede una rettifica.
    if (p.data.corrispettivoCent !== undefined) {
      const ti = await requireImportiOrmeggio(req);
      if ("error" in ti) return ti.error;
      if (p.data.rettifica !== true) return fail("Per cambiare il corrispettivo serve una rettifica esplicita", 409);
    }
    if (cur.stato === "chiusa" && p.data.finePrevistaAt !== undefined) return fail("Permanenza chiusa: la data di fine non si modifica", 409);
    const finePrev = p.data.finePrevistaAt !== undefined
      ? (p.data.finePrevistaAt ? dataSosta(p.data.finePrevistaAt) : null)
      : cur.finePrevistaAt;
    if (p.data.finePrevistaAt && !finePrev) return fail("Data di fine non valida", 422);
    if (finePrev && finePrev <= cur.inizioAt) return fail("La fine deve essere successiva all'inizio", 422);

    let aggiornata;
    try {
      aggiornata = await prisma.$transaction(async (tx) => {
        const corrente = cur.stato === "attiva" && p.data.finePrevistaAt !== undefined
          ? await tx.assegnazionePosto.findFirst({ where: { tenantId: t.tenantId, permanenzaId: cur.id }, orderBy: { dal: "desc" } })
          : null;
        if (corrente && finePrev && finePrev <= corrente.dal) throw new PeriodoNonValido("La fine prevista deve essere successiva all'ultimo spostamento");
        // Rettifica del corrispettivo: una voce di conguaglio, non una modifica silenziosa.
        if (p.data.corrispettivoCent !== undefined) {
          await tx.$queryRaw`SELECT id FROM "Permanenza" WHERE id = ${cur.id} AND "tenantId" = ${t.tenantId} FOR UPDATE`;
          const somma = await tx.addebito.aggregate({
            where: { tenantId: t.tenantId, permanenzaId: cur.id, origine: "custodia" },
            _sum: { importoCent: true },
          });
          const nuovo = p.data.corrispettivoCent ?? 0;
          const diff = nuovo - (somma._sum.importoCent ?? 0);
          if (diff !== 0) {
            await tx.addebito.create({
              data: { tenantId: t.tenantId, permanenzaId: cur.id, descrizione: "Rettifica corrispettivo", importoCent: diff, origine: "custodia", data: new Date() },
            });
          }
        }
        const upd = await tx.permanenza.update({
          where: { id: cur.id },
          data: {
            ...(p.data.finePrevistaAt !== undefined ? { finePrevistaAt: finePrev } : {}),
            ...(p.data.corrispettivoCent !== undefined ? { corrispettivoCent: p.data.corrispettivoCent } : {}),
            ...(p.data.note !== undefined ? { note: p.data.note?.trim() || null } : {}),
            ...(p.data.pronta !== undefined ? { pronta: p.data.pronta } : {}),
          },
        });
        if (cur.stato === "attiva" && p.data.finePrevistaAt !== undefined) {
          // La fine prevista aggiorna l'intervallo dell'assegnazione corrente.
          if (corrente) await tx.assegnazionePosto.update({ where: { id: corrente.id }, data: { al: finePrev } });
        }
        await tx.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.permanenza.aggiorna", entita: "Permanenza", entitaId: cur.id } });
        return upd;
      });
    } catch (e) {
      if (e instanceof PeriodoNonValido) return fail(e.message, 422);
      if (e instanceof Conflitto) return fail(e.message, 409);
      if (conflittoPermanenza(e) || conflittoAssegnazione(e)) return fail("Conflitto sull'assegnazione del posto", 409);
      throw e;
    }
    return ok(aggiornata);
  }

  // sposta: chiude l'intervallo precedente, apre il nuovo, movimento e audit insieme.
  if (cur.stato !== "attiva") return fail("Permanenza non attiva: non si può spostare", 409);
  if (!p.data.postoId) return fail("Indicare il nuovo posto", 422);
  const nuovo = await prisma.posto.findFirst({ where: { id: p.data.postoId, tenantId: t.tenantId }, include: { area: true } });
  if (!nuovo) return fail("Posto non trovato", 404);
  if (!postoNelQuadro(nuovo)) return fail("Posto rimosso dalla griglia: scegli un altro posto", 409);
  if (nuovo.bloccato) return fail("Posto non utilizzabile", 409);
  if (nuovo.id === cur.postoId) return fail("La barca è già in questo posto", 409);

  const decorrenza = p.data.decorrenza ? dataSosta(p.data.decorrenza) : new Date();
  if (!decorrenza) return fail("Data di decorrenza non valida", 422);
  if (decorrenza < cur.inizioAt) return fail("La decorrenza non può precedere l'inizio della permanenza", 422);
  const fineAssegnazione = cur.fineAt ?? cur.finePrevistaAt;
  if (fineAssegnazione && decorrenza >= fineAssegnazione) return fail("La decorrenza è oltre la fine prevista", 422);

  const aperta = await prisma.assegnazionePosto.findFirst({ where: { tenantId: t.tenantId, permanenzaId: cur.id }, orderBy: { dal: "desc" } });
  if (!aperta) return fail("Assegnazione corrente non trovata", 409);
  if (decorrenza < aperta.dal) return fail("Decorrenza precedente all'ultimo spostamento", 409);

  try {
    const aggiornata = await prisma.$transaction(async (tx) => {
      if (cur.boat.proprietarioId) {
        await tx.$queryRaw`SELECT id FROM "Proprietario" WHERE id = ${cur.boat.proprietarioId} AND "tenantId" = ${t.tenantId} FOR SHARE`;
        if (!(await tx.proprietario.findFirst({ where: { id: cur.boat.proprietarioId, tenantId: t.tenantId, archiviato: false } }))) throw new Conflitto("Proprietario eliminato: la barca non può essere spostata");
      }
      await tx.$queryRaw`SELECT id FROM "Area" WHERE id = ${nuovo.areaId} AND "tenantId" = ${t.tenantId} FOR SHARE`;
      const attuale = await tx.posto.findFirst({ where: { id: nuovo.id, tenantId: t.tenantId }, include: { area: true } });
      if (!attuale || !postoNelQuadro(attuale) || attuale.bloccato) throw new Conflitto("Posto rimosso o non utilizzabile: aggiorna il quadro");
      const conflitto = await tx.assegnazionePosto.findFirst({
        where: {
          tenantId: t.tenantId,
          postoId: nuovo.id,
          permanenzaId: { not: cur.id },
          ...sovrapposizioneAssegnazioni(decorrenza, fineAssegnazione),
        },
        orderBy: { dal: "asc" },
        select: { dal: true, al: true },
      });
      if (conflitto) throw new Conflitto(`Il nuovo posto è occupato in questo periodo: ${nuovo.codice} è assegnato ${periodoOccupato(conflitto)}. Modifica la decorrenza o la fine prevista, oppure scegli un altro posto.`);

      await tx.assegnazionePosto.update({ where: { id: aperta.id }, data: { al: decorrenza } });
      await tx.assegnazionePosto.create({
        data: { tenantId: t.tenantId, permanenzaId: cur.id, postoId: nuovo.id, boatId: cur.boatId, dal: decorrenza, al: fineAssegnazione },
      });
      await tx.movimento.create({
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
      const upd = await tx.permanenza.update({ where: { id: cur.id }, data: { postoId: nuovo.id } });
      await tx.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.permanenza.sposta", entita: "Permanenza", entitaId: cur.id } });
      return upd;
    });
    return ok(aggiornata);
  } catch (e) {
    if (e instanceof Conflitto) return fail(e.message, 409);
    if (conflittoPermanenza(e) || conflittoAssegnazione(e)) return fail("Il nuovo posto è occupato in questo periodo", 409);
    throw e;
  }
}
