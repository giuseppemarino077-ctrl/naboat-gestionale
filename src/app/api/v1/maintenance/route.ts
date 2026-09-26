import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
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
    include: { boat: { select: { nome: true } } },
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
  note: z.string().max(1000).optional().nullable(),
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

  const item = await prisma.maintenance.create({
    data: {
      tenantId: t.tenantId,
      boatId: boat.id,
      tipo: p.data.tipo,
      titolo: p.data.titolo,
      dataScadenza,
      oreMotore: p.data.oreMotore ?? null,
      costoCent,
      note: p.data.note ?? null,
    },
  });
  return ok(item, 201);
}
