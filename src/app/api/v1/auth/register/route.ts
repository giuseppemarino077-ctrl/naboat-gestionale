import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { saltHex } from "@/lib/crypto";
import { verifyEmailBody } from "@/lib/mailer";
import { accodaNotifica, consegnaNotifiche } from "@/lib/notifiche";
import { hashPassword } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { createSession } from "@/lib/session";
import { mustTwoFa } from "@/lib/tenant";
import { TERMINI_VERSIONE } from "@/lib/termini";
import { verifyTurnstile } from "@/lib/turnstile";
import { z } from "zod";

const Schema = z.object({
  azienda: z.string().min(2).max(120),
  nome: z.string().min(2).max(120),
  email: z.string().email().max(160),
  password: z.string().min(10).max(128),
  modulo: z.enum(["noleggio", "ormeggio", "entrambi"]).optional(),
  // I testi si accettano esplicitamente: niente registrazione senza consenso.
  accettaTermini: z.literal(true),
  turnstileToken: z.string().max(4000).optional(),
});

// Registrazione proprietario: crea Tenant pending + User owner.
// Login immediato consentito ma operatività bloccata fino ad approvazione.
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await rateLimit(`rl:register:ip:${ip}`, 5, 3600)).ok) return fail("Troppi tentativi, riprova più tardi", 429);

  const body = await req.json().catch(() => null);
  const p = Schema.safeParse(body);
  if (!p.success) return fail("Dati non validi: email valida, password min 10 caratteri", 422);

  if (!(await verifyTurnstile(p.data.turnstileToken, ip))) return fail("Verifica anti-bot non superata", 403);

  const email = p.data.email.toLowerCase().trim();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return fail("Email già registrata", 409);

  const verifyToken = saltHex(24);
  // La scelta fatta in registrazione decide il modulo attivo: noleggio, ormeggio o entrambi.
  const modulo = p.data.modulo ?? "noleggio";
  const passwordHash = await hashPassword(p.data.password);

  const mail = verifyEmailBody(verifyToken);
  let idNotifica: string | null = null;

  // Azienda + titolare nascono insieme: o entrambi o nessuno. Anche la notifica di
  // verifica entra nella transazione: se l'account esiste, il messaggio è in coda.
  const { tenant, user } = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { nome: p.data.azienda.trim(), status: "pending", tipoModulo: modulo, moduloOrmeggio: modulo !== "noleggio" },
    });
    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        email,
        passwordHash,
        role: "owner",
        nome: p.data.nome.trim(),
        verifyToken,
        verifyExpires: new Date(Date.now() + 48 * 60 * 60 * 1000),
        terminiAccettatiAt: new Date(),
        terminiVersione: TERMINI_VERSIONE,
      },
    });
    await tx.auditLog.create({
      data: { tenantId: tenant.id, actorId: user.id, azione: "tenant.register", entita: "Tenant", entitaId: tenant.id },
    });
    const n = await accodaNotifica(
      {
        tenantId: tenant.id,
        evento: "account.verifica-email",
        destinatario: email,
        oggetto: mail.subject,
        testo: mail.text,
        html: mail.html,
        dedupKey: `verifica-email:${user.id}`,
      },
      tx
    );
    idNotifica = n?.id ?? null;
    return { tenant, user };
  });

  if (idNotifica) await consegnaNotifiche({ ids: [idNotifica] }).catch(() => {});

  await createSession({
    sub: user.id,
    tenantId: tenant.id,
    role: user.role,
    tenantStatus: tenant.status,
    twofa: !mustTwoFa(user.role, false),
    ver: user.sessionVersion,
  });
  return ok({ userId: user.id, tenantId: tenant.id, status: tenant.status }, 201);
}
