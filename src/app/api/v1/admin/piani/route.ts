import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";
import { applicaLimitiTutti } from "@/lib/piani";
import { z } from "zod";

// Gestione piani Free/Pro dei noleggiatori (solo NaBoat).
export async function GET() {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const tenants = await prisma.tenant.findMany({
    where: { status: "active" },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, pianoTipo: true, pianoScadenzaAt: true, _count: { select: { boats: true } } },
  });
  return ok(tenants);
}

const Schema = z.object({ tenantId: z.string().uuid(), piano: z.enum(["free", "pro"]), scadenza: z.string().optional().nullable() });

export async function PATCH(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const t = await prisma.tenant.findUnique({ where: { id: p.data.tenantId }, select: { id: true } });
  if (!t) return fail("Azienda non trovata", 404);
  const aggiornata = await prisma.tenant.update({
    where: { id: t.id },
    data: { pianoTipo: p.data.piano, pianoScadenzaAt: p.data.scadenza ? new Date(p.data.scadenza) : null },
  });
  await prisma.auditLog.create({ data: { actorId: g.session.sub, azione: `piano.${p.data.piano}`, entita: "Tenant", entitaId: t.id } });
  return ok({ pianoTipo: aggiornata.pianoTipo, pianoScadenzaAt: aggiornata.pianoScadenzaAt });
}

// Controllo scadenze: mette in pausa le barche eccedenti dei piani Free (anche Pro scaduti).
// Accetta lo staff NaBoat oppure il cron con x-cron-secret.
export async function POST(req: Request) {
  const cron = process.env.CRON_SECRET && req.headers.get("x-cron-secret") === process.env.CRON_SECRET;
  if (!cron) {
    const g = await requireSuperadmin();
    if ("error" in g) return g.error;
  }
  const esito = await applicaLimitiTutti();
  return ok(esito);
}
