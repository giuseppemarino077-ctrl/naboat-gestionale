import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { generateSecret, otpauthUri, verifyTotp } from "@/lib/totp";
import { z } from "zod";

// Stato + gestione 2FA per l'utente autenticato.
// Richiede solo la sessione: non è bloccato da REQUIRE_2FA (serve per abilitarla).

export async function GET() {
  const s = await getSession();
  if (!s) return fail("Non autenticato", 401);
  const u = await prisma.user.findUnique({ where: { id: s.sub }, select: { totpEnabled: true } });
  return ok({ enabled: u?.totpEnabled ?? false });
}

const SetupSchema = z.object({ azione: z.literal("setup") });
const EnableSchema = z.object({ azione: z.literal("enable"), code: z.string().min(6).max(10) });
const DisableSchema = z.object({ azione: z.literal("disable"), code: z.string().min(6).max(10) });

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return fail("Non autenticato", 401);
  const body = await req.json().catch(() => null);

  const setup = SetupSchema.safeParse(body);
  if (setup.success) {
    const secret = generateSecret();
    await prisma.user.update({ where: { id: s.sub }, data: { totpSecret: secret, totpEnabled: false } });
    return ok({ secret, uri: otpauthUri(secret, s.sub) });
  }

  const enable = EnableSchema.safeParse(body);
  if (enable.success) {
    const u = await prisma.user.findUnique({ where: { id: s.sub }, select: { totpSecret: true } });
    if (!u?.totpSecret) return fail("Prima esegui il setup", 422);
    if (!verifyTotp(u.totpSecret, enable.data.code)) return fail("Codice non valido", 422);
    await prisma.user.update({ where: { id: s.sub }, data: { totpEnabled: true } });
    await prisma.auditLog.create({ data: { tenantId: s.tenantId, actorId: s.sub, azione: "auth.2fa.enable" } });
    return ok({ enabled: true });
  }

  const disable = DisableSchema.safeParse(body);
  if (disable.success) {
    const u = await prisma.user.findUnique({ where: { id: s.sub }, select: { totpSecret: true, totpEnabled: true } });
    if (!u?.totpEnabled) return fail("2FA non attiva", 422);
    if (!u.totpSecret || !verifyTotp(u.totpSecret, disable.data.code)) return fail("Codice non valido", 422);
    await prisma.user.update({ where: { id: s.sub }, data: { totpEnabled: false, totpSecret: null } });
    await prisma.auditLog.create({ data: { tenantId: s.tenantId, actorId: s.sub, azione: "auth.2fa.disable" } });
    return ok({ enabled: false });
  }

  return fail("Azione non valida", 422);
}
