import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { FINE_APERTA, conflittoPermanenza, dedupProprietario, requireOrmeggio } from "@/lib/ormeggio";
import { z } from "zod";

// Permanenze attive in una certa data: alimentano la griglia.
// Una sosta con fine prevista occupa fino a quella data; senza fine impegna sempre.
export async function GET(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const url = new URL(req.url);
  const dataStr = url.searchParams.get("data");
  const areaId = url.searchParams.get("areaId");
  const tutte = url.searchParams.get("tutte") === "1";
  const data = dataStr ? new Date(`${dataStr}T12:00:00`) : new Date();
  if (Number.isNaN(data.getTime())) return fail("Data non valida", 422);
  const inizio = new Date(data);
  inizio.setHours(0, 0, 0, 0);
  const fine = new Date(data);
  fine.setHours(23, 59, 59, 999);

  const permanenze = await prisma.permanenza.findMany({
    where: {
      tenantId: t.tenantId,
      ...(tutte
        ? {}
        : {
            stato: "attiva",
            inizioAt: { lte: fine },
            OR: [
              { fineAt: { gte: inizio } },
              { fineAt: null, finePrevistaAt: null },
              { fineAt: null, finePrevistaAt: { gte: inizio } },
            ],
          }),
      ...(areaId ? { posto: { areaId } } : {}),
    },
    include: {
      boat: { select: { id: true, nome: true, tipo: true, uso: true, proprietario: { select: { id: true, nome: true, telefono: true } } } },
      posto: { select: { id: true, codice: true, areaId: true } },
    },
    orderBy: { inizioAt: "asc" },
  });
  // Senza il permesso sugli importi il corrispettivo non compare.
  const lista = t.vedeImporti === false ? permanenze.map((p) => ({ ...p, corrispettivoCent: null })) : permanenze;
  return ok(lista);
}

const Schema = z.object({
  postoId: z.string().uuid(),
  tipo: z.enum(["ormeggio_custodia", "rimessaggio_custodia"]).default("ormeggio_custodia"),
  inizioAt: z.string(),
  finePrevistaAt: z.string().nullable().optional(),
  corrispettivoCent: z.number().int().min(0).max(100000000).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
  proprietarioId: z.string().uuid().optional(),
  nuovoProprietario: z
    .object({ nome: z.string().min(1).max(160), telefono: z.string().max(40).optional().nullable(), email: z.string().email().max(160).optional().nullable() })
    .optional(),
  boatId: z.string().uuid().optional(),
  nuovaBarca: z.object({ nome: z.string().min(1).max(120), tipo: z.string().max(40).optional().nullable() }).optional(),
});

export async function POST(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati permanenza non validi", 422);
  const d = p.data;
  // Scrivere un corrispettivo è un'operazione economica: serve il permesso importi.
  if (d.corrispettivoCent != null && t.vedeImporti === false) return fail("Permesso negato: non hai l'accesso agli importi", 403);
  if (!d.proprietarioId && !d.nuovoProprietario) return fail("Indicare il proprietario", 422);
  if (!d.boatId && !d.nuovaBarca) return fail("Indicare la barca", 422);

  const inizio = new Date(d.inizioAt);
  if (Number.isNaN(inizio.getTime())) return fail("Data di inizio non valida", 422);
  const finePrev = d.finePrevistaAt ? new Date(d.finePrevistaAt) : null;
  if (finePrev && Number.isNaN(finePrev.getTime())) return fail("Data di fine non valida", 422);
  const fineNuova = finePrev ?? FINE_APERTA;

  const posto = await prisma.posto.findFirst({ where: { id: d.postoId, tenantId: t.tenantId } });
  if (!posto) return fail("Posto non trovato", 404);
  if (posto.bloccato) return fail("Posto non utilizzabile", 409);

  let proprietario = null;
  if (d.proprietarioId) {
    proprietario = await prisma.proprietario.findFirst({ where: { id: d.proprietarioId, tenantId: t.tenantId } });
    if (!proprietario) return fail("Proprietario non trovato", 404);
  } else if (d.nuovoProprietario) {
    const dedupKey = dedupProprietario(d.nuovoProprietario);
    proprietario = await prisma.proprietario.findUnique({ where: { tenantId_dedupKey: { tenantId: t.tenantId, dedupKey } } });
    if (!proprietario) {
      proprietario = await prisma.proprietario.create({
        data: {
          tenantId: t.tenantId,
          nome: d.nuovoProprietario.nome.trim(),
          telefono: d.nuovoProprietario.telefono?.trim() || null,
          email: d.nuovoProprietario.email?.trim().toLowerCase() || null,
          dedupKey,
        },
      });
    }
  }

  let boat = null;
  if (d.boatId) {
    boat = await prisma.boat.findFirst({ where: { id: d.boatId, tenantId: t.tenantId } });
    if (!boat) return fail("Barca non trovata", 404);
    if (boat.proprietarioId && proprietario && boat.proprietarioId !== proprietario.id) return fail("La barca appartiene a un altro proprietario", 409);
    if (!boat.proprietarioId && proprietario) {
      await prisma.boat.update({ where: { id: boat.id }, data: { proprietarioId: proprietario.id, uso: "custodia" } });
    }
  } else if (d.nuovaBarca) {
    boat = await prisma.boat.create({
      data: { tenantId: t.tenantId, nome: d.nuovaBarca.nome.trim(), tipo: d.nuovaBarca.tipo?.trim() || null, uso: "custodia", proprietarioId: proprietario!.id },
    });
  }

  const sovrapposto = await prisma.permanenza.count({
    where: {
      tenantId: t.tenantId,
      postoId: posto.id,
      stato: "attiva",
      inizioAt: { lte: fineNuova },
      OR: [{ fineAt: { gte: inizio } }, { fineAt: null, finePrevistaAt: null }, { fineAt: null, finePrevistaAt: { gte: inizio } }],
    },
  });
  if (sovrapposto > 0) return fail("Posto già occupato in questo periodo", 409);

  const barcaGia = await prisma.permanenza.count({
    where: {
      tenantId: t.tenantId,
      boatId: boat!.id,
      stato: "attiva",
      inizioAt: { lte: fineNuova },
      OR: [{ fineAt: { gte: inizio } }, { fineAt: null, finePrevistaAt: null }, { fineAt: null, finePrevistaAt: { gte: inizio } }],
    },
  });
  if (barcaGia > 0) return fail("Barca già presente in struttura in questo periodo", 409);

  let permanenza;
  try {
    permanenza = await prisma.permanenza.create({
      data: {
        tenantId: t.tenantId,
        boatId: boat!.id,
        postoId: posto.id,
        tipo: d.tipo,
        inizioAt: inizio,
        finePrevistaAt: finePrev,
        corrispettivoCent: d.corrispettivoCent ?? null,
        note: d.note?.trim() || null,
      },
    });
  } catch (e) {
    if (conflittoPermanenza(e)) return fail("Posto o barca già occupati in questo periodo", 409);
    throw e;
  }
  if (d.corrispettivoCent) {
    await prisma.addebito.create({
      data: {
        tenantId: t.tenantId,
        permanenzaId: permanenza.id,
        descrizione: d.tipo === "rimessaggio_custodia" ? "Rimessaggio (custodia)" : "Ormeggio (custodia)",
        importoCent: d.corrispettivoCent,
        origine: "custodia",
      },
    });
  }
  await prisma.auditLog.create({
    data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.permanenza.create", entita: "Permanenza", entitaId: permanenza.id },
  });
  return ok(permanenza, 201);
}
