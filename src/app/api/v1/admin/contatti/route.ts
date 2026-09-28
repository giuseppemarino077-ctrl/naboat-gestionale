import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";
import { z } from "zod";

// Messaggi ricevuti dal form «Contatti» del sito: li legge solo NaBoat.
export async function GET() {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;

  const richieste = await prisma.richiestaContatto.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true, nome: true, cognome: true, telefono: true, email: true, tipo: true, messaggio: true, privacyAt: true, lettoAt: true, createdAt: true },
  });

  return ok({ richieste, nonLette: richieste.filter((r) => !r.lettoAt).length });
}

const Schema = z
  .object({
    id: z.string().uuid(),
    letto: z.boolean(),
  })
  .strict();

export async function PATCH(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;

  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);

  const r = await prisma.richiestaContatto
    .update({ where: { id: p.data.id }, data: { lettoAt: p.data.letto ? new Date() : null } })
    .catch(() => null);
  if (!r) return fail("Richiesta non trovata", 404);

  await prisma.auditLog.create({ data: { actorId: g.session.sub, azione: "contatti.letto", entita: "RichiestaContatto", entitaId: r.id } });
  return ok({ lettoAt: r.lettoAt });
}
