import { fail, ok } from "@/lib/api";
import { saltHex } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { resetPasswordClienteBody, sendMail } from "@/lib/mailer";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { z } from "zod";

// Richiesta di reset password del cliente. Risposta sempre uguale per non rivelare le email.
const Schema = z.object({ email: z.string().email().max(160) });

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await rateLimit(`rl:cli-reset:ip:${ip}`, 10, 3600)).ok) return fail("Troppi tentativi: riprova più tardi", 429);
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return ok({ inviato: true });
  const email = p.data.email.toLowerCase().trim();
  if (!(await rateLimit(`rl:cli-reset:email:${email}`, 3, 3600)).ok) return ok({ inviato: true });

  const account = await prisma.clienteAccount.findUnique({ where: { email } });
  if (account) {
    const token = saltHex(24);
    await prisma.clienteAccount.update({ where: { id: account.id }, data: { resetToken: token, resetExpires: new Date(Date.now() + 3600000) } });
    const corpo = resetPasswordClienteBody(token);
    await sendMail(email, corpo.subject, corpo.text, corpo.html).catch(() => {});
  }
  return ok({ inviato: true });
}
