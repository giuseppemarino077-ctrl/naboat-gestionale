import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { FINE_APERTA, conflittoPermanenza, dedupProprietario, requireOrmeggio } from "@/lib/ormeggio";
import { z } from "zod";

// Riconosce la violazione dei vincoli EXCLUDE (posto o barca già occupati).
function conflittoAssegnazione(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /23P01/.test(msg) || /exclusion constraint/i.test(msg) || /assegnazione_(posto|barca)_senza_sovrapposizioni/.test(msg);
}

// Errore interno per riportare un conflitto dalla transazione come 409.
class Conflitto extends Error {}

// Permanenze attive in una certa data: la posizione si ricostruisce dalle
// assegnazioni con validità temporale, quindi una permanenza spostata compare
// nel posto che occupava a quella data (anche se è stata poi chiusa).
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

  const assegnazioni = await prisma.assegnazionePosto.findMany({
    where: {
      tenantId: t.tenantId,
      ...(tutte ? {} : { dal: { lte: fine }, OR: [{ al: null }, { al: { gt: inizio } }] }),
      ...(areaId ? { posto: { areaId } } : {}),
    },
    include: {
      posto: { select: { id: true, codice: true, areaId: true } },
      permanenza: {
        include: {
          boat: { select: { id: true, nome: true, tipo: true, uso: true, proprietario: { select: { id: true, nome: true, telefono: true } } } },
        },
      },
    },
    orderBy: { dal: "asc" },
  });

  const lista = assegnazioni.map((a) => ({
    ...a.permanenza,
    posto: a.posto,
    assegnazione: { id: a.id, postoId: a.postoId, dal: a.dal, al: a.al },
  }));
  // Senza il permesso sugli importi il corrispettivo non compare.
  const out = t.vedeImporti === false ? lista.map((p) => ({ ...p, corrispettivoCent: null })) : lista;
  return ok(out);
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
  // Assumere una barca a noleggio nel modulo custodia è una scelta esplicita.
  confermaConversioneCustodia: z.boolean().optional(),
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
  if (finePrev && finePrev <= inizio) return fail("La fine deve essere successiva all'inizio", 422);
  const fineNuova = finePrev ?? FINE_APERTA;

  // --- Validazione completa prima di qualsiasi scrittura ---
  const posto = await prisma.posto.findFirst({ where: { id: d.postoId, tenantId: t.tenantId } });
  if (!posto) return fail("Posto non trovato", 404);
  if (posto.bloccato) return fail("Posto non utilizzabile", 409);

  let proprietario = null;
  let nuovoProprietario: { dedupKey: string; nome: string; telefono: string | null; email: string | null } | null = null;
  if (d.proprietarioId) {
    proprietario = await prisma.proprietario.findFirst({ where: { id: d.proprietarioId, tenantId: t.tenantId } });
    if (!proprietario) return fail("Proprietario non trovato", 404);
  } else if (d.nuovoProprietario) {
    const dedupKey = dedupProprietario(d.nuovoProprietario);
    proprietario = await prisma.proprietario.findUnique({ where: { tenantId_dedupKey: { tenantId: t.tenantId, dedupKey } } });
    nuovoProprietario = {
      dedupKey,
      nome: d.nuovoProprietario.nome.trim(),
      telefono: d.nuovoProprietario.telefono?.trim() || null,
      email: d.nuovoProprietario.email?.trim().toLowerCase() || null,
    };
  }

  let boat = null;
  if (d.boatId) {
    boat = await prisma.boat.findFirst({ where: { id: d.boatId, tenantId: t.tenantId } });
    if (!boat) return fail("Barca non trovata", 404);
    if (boat.proprietarioId && proprietario && boat.proprietarioId !== proprietario.id) return fail("La barca appartiene a un altro proprietario", 409);
    // La barca di un altro proprietario non può essere riassegnata in silenzio.
    if (boat.proprietarioId && !proprietario) return fail("La barca appartiene a un altro proprietario", 409);
    if (boat.uso === "noleggio") {
      const impegni = await prisma.booking.count({
        where: { tenantId: t.tenantId, boatId: boat.id, stato: { in: ["da_confermare", "prenotata", "in_mare"] } },
      });
      if (impegni > 0) return fail("Barca con prenotazioni attive: non può passare alla custodia", 409);
      if (d.confermaConversioneCustodia !== true) return fail("Barca a noleggio: conferma esplicitamente la conversione a custodia", 409);
    }
  }

  let permanenza;
  try {
    permanenza = await prisma.$transaction(async (tx) => {
      let prop = proprietario;
      if (!prop && nuovoProprietario) {
        prop = await tx.proprietario.upsert({
          where: { tenantId_dedupKey: { tenantId: t.tenantId, dedupKey: nuovoProprietario.dedupKey } },
          create: { tenantId: t.tenantId, ...nuovoProprietario },
          update: {},
        });
      }

      let b = boat;
      if (!b && d.nuovaBarca) {
        b = await tx.boat.create({
          data: { tenantId: t.tenantId, nome: d.nuovaBarca.nome.trim(), tipo: d.nuovaBarca.tipo?.trim() || null, uso: "custodia", proprietarioId: prop!.id },
        });
      } else if (b) {
        const patch: { proprietarioId?: string; uso?: "custodia" } = {};
        if (!b.proprietarioId) patch.proprietarioId = prop!.id;
        if (b.uso === "noleggio") patch.uso = "custodia";
        if (Object.keys(patch).length) b = await tx.boat.update({ where: { id: b.id }, data: patch });
      }

      const sovrapposto = await tx.assegnazionePosto.count({
        where: { tenantId: t.tenantId, postoId: posto.id, dal: { lte: fineNuova }, OR: [{ al: null }, { al: { gt: inizio } }] },
      });
      if (sovrapposto > 0) throw new Conflitto("Posto già occupato in questo periodo");

      const barcaGia = await tx.assegnazionePosto.count({
        where: { tenantId: t.tenantId, boatId: b!.id, dal: { lte: fineNuova }, OR: [{ al: null }, { al: { gt: inizio } }] },
      });
      if (barcaGia > 0) throw new Conflitto("Barca già presente in struttura in questo periodo");

      const perm = await tx.permanenza.create({
        data: {
          tenantId: t.tenantId,
          boatId: b!.id,
          postoId: posto.id,
          tipo: d.tipo,
          inizioAt: inizio,
          finePrevistaAt: finePrev,
          corrispettivoCent: d.corrispettivoCent ?? null,
          note: d.note?.trim() || null,
        },
      });
      // L'assegnazione con validità temporale è la verità storica della posizione.
      await tx.assegnazionePosto.create({
        data: { tenantId: t.tenantId, permanenzaId: perm.id, postoId: posto.id, boatId: b!.id, dal: inizio, al: finePrev },
      });
      if (d.corrispettivoCent) {
        await tx.addebito.create({
          data: {
            tenantId: t.tenantId,
            permanenzaId: perm.id,
            descrizione: d.tipo === "rimessaggio_custodia" ? "Rimessaggio (custodia)" : "Ormeggio (custodia)",
            importoCent: d.corrispettivoCent,
            origine: "custodia",
          },
        });
      }
      await tx.auditLog.create({
        data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.permanenza.create", entita: "Permanenza", entitaId: perm.id },
      });
      return perm;
    });
  } catch (e) {
    if (e instanceof Conflitto) return fail(e.message, 409);
    if (conflittoPermanenza(e) || conflittoAssegnazione(e)) return fail("Posto o barca già occupati in questo periodo", 409);
    throw e;
  }
  return ok(permanenza, 201);
}
