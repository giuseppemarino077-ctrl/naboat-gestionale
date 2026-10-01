import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { bloccaRisorse, verificaDisponibilita } from "@/lib/disponibilita";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

const TIPI = ["assicurazione", "revisione", "tagliando", "ore_motore", "altro"] as const;

function parseEuro(v: string): number | null {
  const n = Math.round(Number(String(v).trim().replace(",", ".")) * 100);
  return Number.isFinite(n) && n >= 0 && n <= 100000000 ? n : null;
}

// Scadenze e interventi sulle barche. Lo stato è calcolato: scaduto / in scadenza / ok.
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams;
  const where: Record<string, unknown> = { tenantId: t.tenantId };
  if (q.get("boatId")) where.boatId = q.get("boatId");
  if (q.get("aperti") === "1") where.eseguitoAt = null;

  const list = await prisma.maintenance.findMany({
    where,
    orderBy: [{ eseguitoAt: "asc" }, { dataScadenza: "asc" }],
    take: 500,
    include: { boat: { select: { nome: true } }, expense: { select: { id: true, importoCent: true, data: true } } },
  });

  const oggi = new Date();
  const limite = new Date(oggi.getTime() + 30 * 86400000);
  const conStato = list.map((m) => {
    let stato: "eseguito" | "scaduto" | "in_scadenza" | "programmato" = "programmato";
    if (m.eseguitoAt) stato = "eseguito";
    else if (m.dataScadenza && m.dataScadenza < oggi) stato = "scaduto";
    else if (m.dataScadenza && m.dataScadenza <= limite) stato = "in_scadenza";
    return { ...m, stato };
  });

  const attenzione = conStato.filter((m) => m.stato === "scaduto" || m.stato === "in_scadenza").length;
  return ok({ items: conStato, attenzione });
}

const Schema = z.object({
  boatId: z.string().uuid(),
  tipo: z.enum(TIPI).default("altro"),
  titolo: z.string().min(2).max(160),
  dataScadenza: z.string().max(40).optional().nullable(),
  oreMotore: z.number().int().min(0).max(1000000).optional().nullable(),
  costoEuro: z.string().max(20).optional().nullable(),
  costoPrevistoEuro: z.string().max(20).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
  // Comando esplicito per bloccare il calendario con un periodo (facoltativo).
  bloccoInizio: z.string().datetime().optional().nullable(),
  bloccoFine: z.string().datetime().optional().nullable(),
});

export async function POST(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);

  const boat = await prisma.boat.findFirst({ where: { id: p.data.boatId, tenantId: t.tenantId }, select: { id: true } });
  if (!boat) return fail("Barca non trovata", 404);

  let dataScadenza: Date | null = null;
  if (p.data.dataScadenza) {
    const d = new Date(p.data.dataScadenza);
    if (Number.isNaN(d.getTime())) return fail("Data di scadenza non valida", 422);
    dataScadenza = d;
  }

  let costoCent: number | null = null;
  if (p.data.costoEuro) {
    costoCent = parseEuro(p.data.costoEuro);
    if (costoCent === null) return fail("Costo non valido", 422);
  }

  // Preventivo: se non indicato a parte, all'apertura il costo indicato è la stima.
  let costoPrevistoCent: number | null = costoCent;
  if (p.data.costoPrevistoEuro) {
    costoPrevistoCent = parseEuro(p.data.costoPrevistoEuro);
    if (costoPrevistoCent === null) return fail("Costo previsto non valido", 422);
  }

  // Blocco calendario esplicito (facoltativo): se indicato il periodo, il blocco
  // nasce collegato all'intervento nella stessa transazione.
  let blocco: { startAt: Date; endAt: Date } | null = null;
  if (p.data.bloccoInizio && p.data.bloccoFine) {
    const s = new Date(p.data.bloccoInizio);
    const e = new Date(p.data.bloccoFine);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || !(s < e)) return fail("Periodo di blocco non valido", 422);
    blocco = { startAt: s, endAt: e };
  }

  const item = await prisma.$transaction(async (tx) => {
    if (blocco) {
      await bloccaRisorse(tx, { boatIds: [boat.id] });
      const disp = await verificaDisponibilita(tx, { tenantId: t.tenantId, boatId: boat.id, startAt: blocco.startAt, endAt: blocco.endAt });
      if (!disp.ok) return { conflitto: disp.messaggio } as const;
    }
    const manutenzione = await tx.maintenance.create({
      data: {
        tenantId: t.tenantId,
        boatId: boat.id,
        tipo: p.data.tipo,
        titolo: p.data.titolo,
        dataScadenza,
        oreMotore: p.data.oreMotore ?? null,
        costoCent,
        costoPrevistoCent,
        note: p.data.note ?? null,
      },
    });
    if (blocco) {
      await tx.block.create({ data: { tenantId: t.tenantId, boatId: boat.id, startAt: blocco.startAt, endAt: blocco.endAt, motivo: "Manutenzione", maintenanceId: manutenzione.id } });
    }
    return { creato: manutenzione } as const;
  });
  if ("conflitto" in item) return fail(item.conflitto ?? "Conflitto con un impegno esistente", 409);
  return ok(item.creato, 201);
}
