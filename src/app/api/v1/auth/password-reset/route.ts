import { fail, ok } from "@/lib/api";
import { saltHex } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { resetPasswordBody, sendMail } from "@/lib/mailer";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { z } from "zod";

// Richiesta di reimpostazione password: manda un link monouso.
// La risposta è sempre la stessa per non rivelare se un'email è registrata.
const Schema = z.object({ email: z.string().email().max(160) });

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await rateLimit(`rl:reset:ip:${ip}`, 10, 3600)).ok) return fail("Troppi tentativi: riprova più tardi", 429);

  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return ok({ inviato: true });

  const email = p.data.email.toLowerCase().trim();
  if (!(await rateLimit(`rl:reset:email:${email}`, 3, 3600)).ok) return ok({ inviato: true });

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, passwordHash: true } });
  if (user?.passwordHash) {
    const token = saltHex(24);
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: token, resetExpires: new Date(Date.now() + 60 * 60 * 1000) },
    });
    const mail = resetPasswordBody(token);
    await sendMail(email, mail.subject, mail.text, mail.html).catch(() => {});
  }
  return ok({ inviato: true });
}
