import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";
import { z } from "zod";

// Solo NaBoat: azzera la 2FA di un utente (recupero quando perde il telefono o
// cambia dispositivo). Incrementa la versione di sessione: dovrà riaccedere.
const Schema = z.object({ email: z.string().email().max(160) });

export async function POST(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi: indicare l'email dell'utente", 422);

  const u = await prisma.user.findUnique({
    where: { email: p.data.email.toLowerCase().trim() },
    select: { id: true, tenantId: true, totpEnabled: true },
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
