import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";
import { z } from "zod";

// Solo NaBoat: elenco utenti di un'azienda (per il recupero della 2FA).
export async function GET(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const tenantId = new URL(req.url).searchParams.get("tenantId");
  if (!tenantId) return fail("Parametro tenantId obbligatorio", 422);
  const utenti = await prisma.user.findMany({
    where: { tenantId },
    orderBy: [{ role: "asc" }, { email: "asc" }],
    select: { id: true, email: true, nome: true, role: true, totpEnabled: true, emailVerified: true },
  });
  return ok(utenti);
}

// Azzera la 2FA di un utente (recupero quando perde il telefono o cambia dispositivo).
// Si può indicare l'utente per id oppure per email. Incrementa la versione di sessione:
// dovrà riaccedere.
const Schema = z
  .object({
    userId: z.string().uuid().optional(),
    email: z.string().email().max(160).optional(),
  })
  .refine((v) => v.userId || v.email, { message: "Indicare userId oppure email" });

export async function POST(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi: indicare l'utente", 422);

  const u = await prisma.user.findFirst({
    where: p.data.userId ? { id: p.data.userId } : { email: p.data.email!.toLowerCase().trim() },
    select: { id: true, tenantId: true },
  });
  if (!u) return fail("Utente non trovato", 404);

  await prisma.user.update({
    where: { id: u.id },
    data: { totpEnabled: false, totpSecret: null, sessionVersion: { increment: 1 } },
  });
  await prisma.auditLog.create({
    data: { tenantId: u.tenantId, actorId: g.session.sub, azione: "admin.2fa.reset", entita: "User", entitaId: u.id },
  });
  return ok({ ok: true, dueFattoriAttiva: false });
}
