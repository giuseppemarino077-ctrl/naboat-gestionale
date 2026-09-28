import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Recensioni dell'azienda: elenco, media, distribuzione dei voti e recensioni senza risposta.
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const recensioni = await prisma.recensione.findMany({
    where: { tenantId: t.tenantId },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      booking: { select: { id: true, startAt: true, clienteNome: true, boat: { select: { id: true, nome: true } } } },
    },
  });
  const pubblicate = recensioni.filter((r) => r.stato === "pubblicata");
  const distribuzione = [1, 2, 3, 4, 5].map((v) => ({ voto: v, n: pubblicate.filter((r) => r.voto === v).length }));
  const media = pubblicate.length ? pubblicate.reduce((s, r) => s + r.voto, 0) / pubblicate.length : 0;
  return ok({
    recensioni,
    sintesi: { media, totale: pubblicate.length, senzaRisposta: pubblicate.filter((r) => !r.risposta).length, distribuzione },
  });
}

const Schema = z.object({ id: z.string().uuid(), risposta: z.string().trim().max(2000) });

// Risposta pubblica del noleggiatore (il cliente la vede).
export async function PATCH(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Risposta non valida", 422);
  const r = await prisma.recensione.findFirst({ where: { id: p.data.id, tenantId: t.tenantId } });
  if (!r) return fail("Recensione non trovata", 404);
  const aggiornata = await prisma.recensione.update({ where: { id: r.id }, data: { risposta: p.data.risposta, rispostaAt: new Date() } });
  await prisma.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "recensione.risposta", entita: "Recensione", entitaId: r.id } });
  return ok(aggiornata);
}
