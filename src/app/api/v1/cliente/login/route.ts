import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { createSession } from "@/lib/session";
import { z } from "zod";

const Schema = z.object({ email: z.string().trim().email().max(160), password: z.string().min(1).max(128) });

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await rateLimit(`rl:cliente-login:ip:${ip}`, 20, 600)).ok) return fail("Troppi tentativi: riprova più tardi", 429);
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const email = p.data.email.toLowerCase();
  if (!(await rateLimit(`rl:cliente-login:email:${email}`, 10, 600)).ok) return fail("Troppi tentativi: riprova più tardi", 429);

  const account = await prisma.clienteAccount.findUnique({ where: { email } });
  if (!account || !(await verifyPassword(p.data.password, account.passwordHash))) return fail("Email o password non corretti", 401);

  await createSession({ sub: account.id, tenantId: null, role: "cliente", tenantStatus: null, twofa: true, ver: account.sessionVersion });
  return ok({ id: account.id, nome: account.nome, email: account.email });
}
