import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { createSession } from "@/lib/session";
import { isOwnerOrSuperadmin, mustTwoFa } from "@/lib/tenant";
import { verifyTotp } from "@/lib/totp";
import { verifyTurnstile } from "@/lib/turnstile";
import { NextResponse } from "next/server";
import { z } from "zod";

const Schema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
  totpCode: z.string().max(10).optional(),
  turnstileToken: z.string().max(4000).optional(),
});

export async function POST(req: Request) {
  const ip = clientIp(req);

  // Doppio rate-limit: per IP (attacchi distribuiti) e per email (brute force mirato).
  if (!(await rateLimit(`rl:login:ip:${ip}`, 20, 600)).ok) return fail("Troppi tentativi, riprova tra 10 minuti", 429);

  const body = await req.json().catch(() => null);
  const p = Schema.safeParse(body);
  if (!p.success) return fail("Credenziali non valide", 422);

  const email = p.data.email.toLowerCase().trim();
  if (!(await rateLimit(`rl:login:email:${email}`, 10, 600)).ok) return fail("Troppi tentativi, riprova tra 10 minuti", 429);

  if (!(await verifyTurnstile(p.data.turnstileToken, ip))) return fail("Verifica anti-bot non superata", 403);

  const user = await prisma.user.findUnique({ where: { email }, include: { tenant: true } });
  if (!user?.passwordHash) return fail("Credenziali non valide", 401);
  if (!(await verifyPassword(p.data.password, user.passwordHash))) return fail("Credenziali non valide", 401);
  const memberships = user.role === "superadmin" ? [] : await prisma.appartenenza.findMany({ where: { userId: user.id, stato: "attiva" }, include: { tenant: true }, orderBy: { createdAt: "asc" } });
  const m = memberships.find((m) => m.tenantId === user.tenantId && m.tenant.status !== "suspended") ?? memberships.find((m) => m.tenant.status === "active") ?? memberships[0];
  if (user.role !== "superadmin" && !m) return fail("Non hai accessi aziendali attivi", 403);
  const tenant = m?.tenant ?? user.tenant;
  const role = m?.role ?? user.role;
  if (tenant?.status === "suspended") return fail("Account sospeso, contatta NaBoat", 403);

  // 2FA: richiesto se abilitata dall'utente, oppure obbligatoria per owner/superadmin.
  const required = user.totpEnabled || mustTwoFa(role, false);
  let twofaDone = true;
  if (user.totpEnabled) {
    if (!p.data.totpCode) return NextResponse.json({ error: "Codice 2FA richiesto", twoFactorRequired: true }, { status: 401 });
    if (!user.totpSecret || !verifyTotp(user.totpSecret, p.data.totpCode)) {
      return NextResponse.json({ error: "Codice 2FA non valido", twoFactorRequired: true }, { status: 401 });
    }
    twofaDone = true;
  } else {
    // Non abilitata: la sessione è valida ma potrebbe restare bloccata da REQUIRE_2FA.
    twofaDone = required ? false : true;
  }

  await createSession({
    sub: user.id,
    tenantId: m?.tenantId ?? user.tenantId,
    role,
    tenantStatus: tenant?.status ?? null,
    twofa: twofaDone,
    ver: user.sessionVersion,
  });
  return ok({
    userId: user.id,
    role,
    tenantStatus: tenant?.status ?? null,
    tenantModulo: (m && m.role !== "owner" && !m.accessoNoleggio && m.accessoOrmeggio ? "ormeggio" : tenant?.tipoModulo) ?? null,
    tenantOrmeggio: (tenant?.moduloOrmeggio && (m?.role === "owner" || (m?.accessoOrmeggio ?? true))) ?? false,
    twoFactorRequired: false,
    twoFactorSetupRequired: isOwnerOrSuperadmin(role) && !user.totpEnabled && mustTwoFa(role, false),
  });
}
