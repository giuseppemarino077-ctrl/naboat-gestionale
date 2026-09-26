import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { dedupProprietario, requireOrmeggio } from "@/lib/ormeggio";
import { z } from "zod";

const Schema = z.object({
  nome: z.string().min(1).max(160),
  telefono: z.string().max(40).optional().nullable(),
  email: z.string().email().max(160).optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

export async function GET(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const proprietari = await prisma.proprietario.findMany({
    where: {
      tenantId: t.tenantId,
      ...(q
        ? {
            OR: [
              { nome: { contains: q, mode: "insensitive" } },
              { telefono: { contains: q } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { nome: "asc" },
    include: { boats: { select: { id: true, nome: true } } },
    take: 50,
  });
  return ok(proprietari);
}

export async function POST(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati proprietario non validi", 422);
  const dedupKey = dedupProprietario(p.data);
  const esistente = await prisma.proprietario.findUnique({ where: { tenantId_dedupKey: { tenantId: t.tenantId, dedupKey } } });
  if (esistente) return ok({ ...esistente, esistente: true });
  const creato = await prisma.proprietario.create({
    data: {
      tenantId: t.tenantId,
      nome: p.data.nome.trim(),
      telefono: p.data.telefono?.trim() || null,
      email: p.data.email?.trim().toLowerCase() || null,
      note: p.data.note?.trim() || null,
      dedupKey,
    },
  });
  await prisma.auditLog.create({
    data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.proprietario.create", entita: "Proprietario", entitaId: creato.id },
  });
  return ok(creato, 201);
}
