import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { z } from "zod";

// Conferma il reset: imposta la nuova password e invalida tutte le sessioni
// (sessionVersion) così eventuali gettoni rubati non restano validi.
const Schema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(10).max(128),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await rateLimit(`rl:reset-conferma:ip:${ip}`, 20, 3600)).ok) return fail("Troppi tentativi: riprova più tardi", 429);

  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi: la password deve avere almeno 10 caratteri", 422);

  const u = await prisma.user.findFirst({ where: { resetToken: p.data.token }, select: { id: true, resetExpires: true } });
  if (!u) return fail("Link non valido o già usato", 404);
  if (u.resetExpires && u.resetExpires < new Date()) return fail("Link scaduto: richiedine un altro", 422);

  await prisma.user.update({
    where: { id: u.id },
    data: {
      passwordHash: await hashPassword(p.data.password),
      resetToken: null,
      resetExpires: null,
      sessionVersion: { increment: 1 },
    },
  });
  return ok({ reimpostata: true });
}
