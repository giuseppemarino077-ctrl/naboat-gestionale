import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Basi operative / porti dell'azienda: alimentano calendario, profilo pubblico,
// schede barca e dettagli prenotazione.
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const porti = await prisma.porto.findMany({
    where: { tenantId: t.tenantId },
    orderBy: { nome: "asc" },
    include: { _count: { select: { boats: true } } },
  });
  return ok(porti);
}

const Schema = z.object({
  nome: z.string().trim().min(2).max(120),
  indirizzo: z.string().trim().max(240).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lon: z.number().min(-180).max(180).optional().nullable(),
  // Identificativo del luogo Google Places (dato del provider).
  placeId: z.string().max(300).optional().nullable(),
  note: z.string().trim().max(600).optional().nullable(),
  orari: z.string().trim().max(240).optional().nullable(),
});

export async function POST(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati del porto non validi", 422);
  const porto = await prisma.porto.create({
    data: {
      tenantId: t.tenantId,
      nome: p.data.nome,
      indirizzo: p.data.indirizzo ?? null,
      lat: p.data.lat ?? null,
      lon: p.data.lon ?? null,
      placeId: p.data.placeId ?? null,
      note: p.data.note ?? null,
      orari: p.data.orari ?? null,
    },
  });
  await prisma.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "porto.crea", entita: "Porto", entitaId: porto.id } });
  return ok(porto, 201);
}
