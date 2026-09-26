import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { parseImportoEuro } from "@/lib/payments";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Tipo di noleggio: serve a scegliere la tariffa giusta.
const TIPI = ["mezza_giornata", "giornata", "settimana"] as const;
type Tipo = (typeof TIPI)[number];

// Stagione alta: dal 1 giugno al 30 settembre (regola semplice, modificabile qui se serve).
function stagioneDi(data: Date): "alta" | "bassa" {
  const mese = data.getUTCMonth() + 1;
  return mese >= 6 && mese <= 9 ? "alta" : "bassa";
}

export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams;

  // Con ?boatId e ?data restituisce il prezzo da proporre.
  if (q.get("boatId") || q.get("data")) {
    const boatId = q.get("boatId");
    const tipoParam = q.get("tipo") as Tipo | null;
    const tipo: Tipo = tipoParam && TIPI.includes(tipoParam) ? tipoParam : "giornata";
    const data = q.get("data") ? new Date(q.get("data")!) : new Date();
    if (Number.isNaN(data.getTime())) return fail("Data non valida", 422);
    const stagione = stagioneDi(data);

    const candidate = await prisma.tariffa.findMany({
      where: {
        tenantId: t.tenantId,
        attivo: true,
        tipo,
        stagione: { in: [stagione, "tutto_anno"] },
        ...(boatId ? { OR: [{ boatId }, { boatId: null }] } : {}),
      },
      orderBy: [{ boatId: "desc" }],
    });
    // Preferisce la tariffa della barca, meglio se stagionale; altrimenti quella generale.
    const scelta =
      candidate.find((c) => c.boatId && c.stagione === stagione) ??
      candidate.find((c) => c.boatId) ??
      candidate.find((c) => c.stagione === stagione) ??
      candidate[0] ??
      null;

    return ok({
      tipo,
      stagione,
      prezzoCent: scelta?.prezzoCent ?? null,
      tariffaId: scelta?.id ?? null,
    });
  }

  const list = await prisma.tariffa.findMany({
    where: { tenantId: t.tenantId },
    orderBy: [{ tipo: "asc" }, { stagione: "asc" }],
    include: { boat: { select: { nome: true } } },
  });
  return ok(list);
}

const Schema = z.object({
  boatId: z.string().uuid().optional().nullable(),
  tipo: z.enum(TIPI),
  stagione: z.enum(["alta", "bassa", "tutto_anno"]).default("tutto_anno"),
  prezzoEuro: z.string().min(1).max(20),
  attivo: z.boolean().default(true),
});

export async function POST(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati tariffa non validi", 422);

  const prezzoCent = parseImportoEuro(p.data.prezzoEuro);
  if (prezzoCent === null) return fail("Prezzo non valido", 422);

  if (p.data.boatId) {
    const b = await prisma.boat.findFirst({ where: { id: p.data.boatId, tenantId: t.tenantId }, select: { id: true } });
    if (!b) return fail("Barca non trovata", 404);
  }

  const esistente = await prisma.tariffa.findFirst({
    where: { tenantId: t.tenantId, boatId: p.data.boatId ?? null, tipo: p.data.tipo, stagione: p.data.stagione },
    select: { id: true },
  });

  const tariffa = esistente
    ? await prisma.tariffa.update({ where: { id: esistente.id }, data: { prezzoCent, attivo: p.data.attivo } })
    : await prisma.tariffa.create({
        data: {
          tenantId: t.tenantId,
          boatId: p.data.boatId ?? null,
          tipo: p.data.tipo,
          stagione: p.data.stagione,
          prezzoCent,
          attivo: p.data.attivo,
        },
      });

  return ok(tariffa, esistente ? 200 : 201);
}

export async function DELETE(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("Parametro id obbligatorio", 422);
  const cur = await prisma.tariffa.findFirst({ where: { id, tenantId: t.tenantId }, select: { id: true } });
  if (!cur) return fail("Tariffa non trovata", 404);
  await prisma.tariffa.delete({ where: { id: cur.id } });
  return ok({ id: cur.id, eliminata: true });
}
