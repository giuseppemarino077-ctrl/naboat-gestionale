import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Catalogo dei modelli condiviso: i modelli approvati da NaBoat più quelli inseriti
// da questa azienda (in attesa di verifica).
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const modelli = await prisma.modelloBarca.findMany({
    where: { OR: [{ stato: "approvato" }, { creatoDaTenantId: t.tenantId }] },
    orderBy: [{ marca: "asc" }, { modello: "asc" }],
    take: 500,
  });
  return ok(modelli);
}

const Schema = z.object({
  marca: z.string().trim().max(80).optional().nullable(),
  modello: z.string().trim().min(2).max(120),
  tipo: z.string().trim().max(40).optional().nullable(),
  capienza: z.number().int().min(1).max(60).optional().nullable(),
  lunghezzaM: z.number().min(0).max(200).optional().nullable(),
  potenzaCv: z.number().int().min(0).max(2000).optional().nullable(),
  cabine: z.number().int().min(0).max(30).optional().nullable(),
  dotazioni: z.array(z.string().max(60)).max(40).optional(),
});

export async function POST(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati del modello non validi", 422);
  const modello = await prisma.modelloBarca.create({
    data: { ...p.data, stato: "in_verifica", creatoDaTenantId: t.tenantId },
  });
  await prisma.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "modello.crea", entita: "ModelloBarca", entitaId: modello.id } });
  return ok(modello, 201);
}
