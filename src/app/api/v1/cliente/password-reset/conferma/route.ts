import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { z } from "zod";

const Schema = z.object({ token: z.string().min(20).max(200), password: z.string().min(10, "La password deve avere almeno 10 caratteri").max(128) });

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await rateLimit(`rl:cli-reset-conf:ip:${ip}`, 20, 3600)).ok) return fail("Troppi tentativi: riprova più tardi", 429);
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dati non validi", 422);

  const account = await prisma.clienteAccount.findFirst({ where: { resetToken: p.data.token }, select: { id: true, resetExpires: true, sessionVersion: true } });
  if (!account) return fail("Link non valido o già usato", 404);
  if (account.resetExpires && account.resetExpires < new Date()) return fail("Link scaduto: richiedine un altro", 422);

  await prisma.clienteAccount.update({
    where: { id: account.id },
    // L'aumento della versione invalida le sessioni cliente già aperte (anche il cookie
    // nb_cliente): requireCliente le rifiuta finché non si accede di nuovo.
    data: { passwordHash: await hashPassword(p.data.password), resetToken: null, resetExpires: null, sessionVersion: account.sessionVersion + 1 },
  });
  return ok({ reimpostata: true });
}
