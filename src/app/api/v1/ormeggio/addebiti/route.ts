import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/lib/ormeggio";
import { z } from "zod";

export async function GET(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const permanenzaId = new URL(req.url).searchParams.get("permanenzaId");
  const addebiti = await prisma.addebito.findMany({
    where: { tenantId: t.tenantId, ...(permanenzaId ? { permanenzaId } : {}) },
    orderBy: { data: "desc" },
    take: 300,
  });
  return ok(addebiti);
}

const Schema = z.object({
  permanenzaId: z.string().uuid(),
  descrizione: z.string().min(1).max(160),
  importoCent: z.number().int().min(0).max(100000000),
  origine: z.enum(["custodia", "servizio", "carburante", "altro"]).default("altro"),
  data: z.string().optional(),
});

export async function POST(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati addebito non validi", 422);
  const perm = await prisma.permanenza.findFirst({ where: { id: p.data.permanenzaId, tenantId: t.tenantId } });
  if (!perm) return fail("Permanenza non trovata", 404);
  const addebito = await prisma.addebito.create({
    data: {
      tenantId: t.tenantId,
      permanenzaId: perm.id,
      descrizione: p.data.descrizione.trim(),
      importoCent: p.data.importoCent,
      origine: p.data.origine,
      ...(p.data.data ? { data: new Date(p.data.data) } : {}),
    },
  });
  return ok(addebito, 201);
}
