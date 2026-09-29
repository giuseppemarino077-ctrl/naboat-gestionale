import { fail, ok } from "@/lib/api";
import { registraAzione } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/lib/ormeggio";
import { addettoDelTenant } from "@/lib/riferimenti";
import { Prisma } from "@prisma/client";
import { z } from "zod";

function isP2002(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

function origineDaTipo(tipo: string): "carburante" | "servizio" {
  return /carburante|benzina|gasolio/i.test(tipo) ? "carburante" : "servizio";
}

const Schema = z.object({
  stato: z.enum(["da_fare", "in_corso", "completato"]).optional(),
  addettoId: z.string().uuid().optional().nullable(),
  quantita: z.number().min(0).max(100000).optional().nullable(),
  prezzoCent: z.number().int().min(0).max(100000000).optional().nullable(),
  incluso: z.boolean().optional(),
  note: z.string().max(1000).optional().nullable(),
  // Una voce già contabilizzata si corregge solo con rettifica o storno espliciti.
  rettifica: z.boolean().optional(),
  storno: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati attività non validi", 422);
  const att = await prisma.attivita.findFirst({ where: { id, tenantId: t.tenantId }, include: { addebito: true } });
  if (!att) return fail("Attività non trovata", 404);
  if (p.data.addettoId && !(await addettoDelTenant(t.tenantId, p.data.addettoId))) return fail("Addetto non valido per questa azienda", 422);

  const contabilizzata = !!att.addebito;
  const cambiaEconomia = p.data.quantita !== undefined || p.data.prezzoCent !== undefined || p.data.incluso !== undefined;

  // Una voce già incassata non si storna né si rettifica in silenzio.
  if (att.addebito?.stato === "pagato" && (p.data.storno || p.data.rettifica)) {
    return fail("Addebito già pagato: prima va stornato l'incasso", 409);
  }

  // Senza il permesso importi non si scrivono prezzi né si generano/stornano addebiti.
  if (t.vedeImporti === false) {
    if (p.data.prezzoCent !== undefined || p.data.rettifica || p.data.storno) return fail("Permesso negato: non hai l'accesso agli importi", 403);
    const prezzoFinale = att.prezzoCent;
    const inclusoFinale = p.data.incluso !== undefined ? p.data.incluso : att.incluso;
    if (p.data.stato === "completato" && !inclusoFinale && prezzoFinale) return fail("Permesso negato: non hai l'accesso agli importi", 403);
    if (contabilizzata && cambiaEconomia) return fail("Permesso negato: non hai l'accesso agli importi", 403);
  }

  // Storno esplicito: annulla la voce di conto e riapre l'attività.
  if (p.data.storno) {
    if (!att.addebito) return fail("Nessun addebito da stornare", 422);
    const addebito = att.addebito;
    const aggiornata = await prisma.$transaction(async (tx) => {
      await tx.addebito.delete({ where: { id: addebito.id } });
      return tx.attivita.update({
        where: { id: att.id },
        data: {
          stato: p.data.stato ?? "da_fare",
          completatoAt: null,
          ...(p.data.note !== undefined ? { note: p.data.note?.trim() || null } : {}),
        },
      });
    });
    await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.attivita.storno", entita: "Attivita", entitaId: att.id, nota: `${att.tipo} ${addebito.importoCent}` });
    return ok(aggiornata);
  }

  if (contabilizzata && cambiaEconomia && p.data.rettifica !== true) {
    return fail("Attività contabilizzata: usa la rettifica (rettifica: true) o lo storno", 409);
  }
  if (contabilizzata && p.data.stato !== undefined && p.data.stato !== "completato" && p.data.rettifica !== true) {
    return fail("Attività contabilizzata: per riaprirla serve lo storno", 409);
  }

  // Rettifica: aggiorna la voce collegata (nessun nuovo addebito, resta unica).
  if (contabilizzata && p.data.rettifica) {
    const nuovaQ = p.data.quantita !== undefined ? p.data.quantita : att.quantita;
    const nuovoP = p.data.prezzoCent !== undefined ? p.data.prezzoCent : att.prezzoCent;
    const nuovoIncluso = p.data.incluso !== undefined ? p.data.incluso : att.incluso;
    const nuovoImporto = nuovoIncluso ? 0 : Math.round((nuovoP ?? 0) * (nuovaQ ?? 1));
    const aggiornata = await prisma.$transaction(async (tx) => {
      await tx.addebito.update({ where: { id: att.addebito!.id }, data: { importoCent: nuovoImporto, origine: origineDaTipo(att.tipo) } });
      return tx.attivita.update({
        where: { id: att.id },
        data: {
          ...(p.data.stato !== undefined ? { stato: p.data.stato } : {}),
          ...(p.data.quantita !== undefined ? { quantita: p.data.quantita } : {}),
          ...(p.data.prezzoCent !== undefined ? { prezzoCent: p.data.prezzoCent } : {}),
          ...(p.data.incluso !== undefined ? { incluso: p.data.incluso } : {}),
          ...(p.data.note !== undefined ? { note: p.data.note?.trim() || null } : {}),
        },
      });
    });
    await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.attivita.rettifica", entita: "Attivita", entitaId: att.id, nota: `${att.tipo} ${nuovoImporto}` });
    return ok(aggiornata);
  }

  const completato = p.data.stato === "completato";
  let aggiornata;
  try {
    aggiornata = await prisma.$transaction(async (tx) => {
      const upd = await tx.attivita.update({
        where: { id: att.id },
        data: {
          ...(p.data.stato ? { stato: p.data.stato } : {}),
          ...(p.data.addettoId !== undefined ? { addettoId: p.data.addettoId } : {}),
          ...(p.data.quantita !== undefined ? { quantita: p.data.quantita } : {}),
          ...(p.data.prezzoCent !== undefined ? { prezzoCent: p.data.prezzoCent } : {}),
          ...(p.data.incluso !== undefined ? { incluso: p.data.incluso } : {}),
          ...(p.data.note !== undefined ? { note: p.data.note?.trim() || null } : {}),
          ...(completato ? { completatoAt: att.completatoAt ?? new Date() } : {}),
        },
      });
      // Al completamento nasce UNA sola voce di conto (i servizi inclusi non generano extra).
      // L'unicità su Addebito.attivitaId rende l'operazione idempotente anche in concorrenza.
      if (completato && !upd.incluso && upd.prezzoCent) {
        const esistente = await tx.addebito.findUnique({ where: { attivitaId: att.id }, select: { id: true } });
        if (!esistente) {
          await tx.addebito.create({
            data: {
              tenantId: t.tenantId,
              permanenzaId: upd.permanenzaId,
              descrizione: upd.tipo,
              importoCent: Math.round(upd.prezzoCent * (upd.quantita ?? 1)),
              origine: origineDaTipo(upd.tipo),
              attivitaId: att.id,
            },
          });
        }
      }
      return upd;
    });
  } catch (e) {
    // Un'altra richiesta ha contabilizzato nello stesso istante: nessun doppione.
    if (isP2002(e)) {
      const corrente = await prisma.attivita.findFirst({ where: { id, tenantId: t.tenantId } });
      return ok(corrente);
    }
    throw e;
  }
  await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: p.data.stato ? `ormeggio.attivita.${p.data.stato}` : "ormeggio.attivita.modifica", entita: "Attivita", entitaId: att.id, nota: aggiornata.tipo });
  return ok(aggiornata);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const att = await prisma.attivita.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!att) return fail("Attività non trovata", 404);
  const addebiti = await prisma.addebito.count({ where: { tenantId: t.tenantId, attivitaId: att.id } });
  if (addebiti > 0) return fail("Attività con addebito collegato: non eliminabile (usa lo storno)", 409);
  await prisma.attivita.delete({ where: { id: att.id } });
  await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.attivita.elimina", entita: "Attivita", entitaId: att.id, nota: att.tipo });
  return ok({ ok: true });
}
