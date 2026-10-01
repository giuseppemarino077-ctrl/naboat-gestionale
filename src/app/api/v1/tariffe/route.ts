import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { stagioneDi, tariffaPerPreventivo, TIPI_TARIFFA, type TipoTariffa } from "@/lib/marketplace";
import { parseImportoEuro } from "@/lib/payments";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Tipo di noleggio: serve a scegliere la tariffa giusta.
const TIPI = TIPI_TARIFFA;
type Tipo = TipoTariffa;

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

    // Precedenza unica (src/lib/marketplace.ts): barca+stagione esatta, barca
    // tutto_anno, generale+stagione esatta, generale tutto_anno. Niente minimi
    // fra voci incompatibili: se non c'è la voce giusta il prezzo è null.
    const scelta = await tariffaPerPreventivo(t.tenantId, boatId, tipo, stagione);

    return ok({
      tipo,
      stagione,
      prezzoCent: scelta?.prezzoCent ?? null,
      tariffaId: scelta?.tariffaId ?? null,
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
  // Piano base integrato (BOATLY): nome leggibile, durata in ore e modalità collegata.
  nomePiano: z.string().max(120).optional().nullable(),
  durataOre: z.number().min(1).max(24).optional().nullable(),
  offertaId: z.string().uuid().optional().nullable(),
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

  if (p.data.offertaId) {
    const off = await prisma.boatOfferta.findFirst({ where: { id: p.data.offertaId, tenantId: t.tenantId }, select: { id: true } });
    if (!off) return fail("Modalità non valida per questa azienda", 422);
  }

  const extra = { nomePiano: p.data.nomePiano ?? null, durataOre: p.data.durataOre ?? null, offertaId: p.data.offertaId ?? null };
  const tariffa = esistente
    ? await prisma.tariffa.update({ where: { id: esistente.id }, data: { prezzoCent, attivo: p.data.attivo, ...extra } })
    : await prisma.tariffa.create({
        data: {
          tenantId: t.tenantId,
          boatId: p.data.boatId ?? null,
          tipo: p.data.tipo,
          stagione: p.data.stagione,
          prezzoCent,
          attivo: p.data.attivo,
          ...extra,
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
