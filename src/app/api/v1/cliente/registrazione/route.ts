import { fail, ok } from "@/lib/api";
import { saltHex } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { clienteVerificaBody, sendMail } from "@/lib/mailer";
import { hashPassword } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { createClienteSession } from "@/lib/session";
import { z } from "zod";

// Registrazione del cliente finale (account di piattaforma, non di una singola azienda).
const Schema = z.object({
  nome: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  telefono: z.string().trim().max(40).optional().nullable(),
  password: z.string().min(10, "La password deve avere almeno 10 caratteri").max(128),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await rateLimit(`rl:cliente-reg:ip:${ip}`, 5, 3600)).ok) return fail("Troppi tentativi: riprova più tardi", 429);
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dati non validi", 422);
  const email = p.data.email.toLowerCase();

  const esiste = await prisma.clienteAccount.findUnique({ where: { email }, select: { id: true } });
  if (esiste) return fail("Esiste già un account con questa email", 409);

  // L'email non è ancora confermata: si verifica con un link monouso (48 ore).
  const verifyToken = saltHex(24);
  const account = await prisma.clienteAccount.create({
    data: {
      email,
      nome: p.data.nome,
      telefono: p.data.telefono ?? null,
      passwordHash: await hashPassword(p.data.password),
      emailVerified: false,
      verifyToken,
      verifyExpires: new Date(Date.now() + 48 * 60 * 60 * 1000),
    },
  });

  const base = process.env.APP_URL || new URL(req.url).origin;
  const mail = clienteVerificaBody(`${base}/area/verifica-email?token=${encodeURIComponent(verifyToken)}`);
  await sendMail(email, mail.subject, mail.text, mail.html).catch(() => {});

  // Cookie dedicato al cliente (nb_cliente): non tocca la sessione operatore.
  await createClienteSession({ sub: account.id, tenantId: null, role: "cliente", tenantStatus: null, twofa: true, ver: account.sessionVersion });
  return ok({ id: account.id, nome: account.nome, email: account.email }, 201);
}
