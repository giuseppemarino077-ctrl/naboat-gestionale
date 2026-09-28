import { fail, ok } from "@/lib/api";
import { registraAzione } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { identitaCorrente } from "@/lib/identita";
import { createSession } from "@/lib/session";
import { mustTwoFa } from "@/lib/tenant";
import { generateSecret, otpauthUri, verifyTotp } from "@/lib/totp";
import { z } from "zod";

// Stato + gestione 2FA per l'utente autenticato.
// Richiede solo l'identità (non un'azienda operativa): serve anche ad abilitarla
// durante l'onboarding. Ogni azione verifica utente e versione della sessione.

export async function GET() {
  const id = await identitaCorrente();
  if (!id.ok) {
    if (id.motivo === "no-session") return fail("Non autenticato", 401);
    return fail("Sessione non più valida: accedi di nuovo", 401);
  }
  return ok({ enabled: id.user.totpEnabled, pending: !!id.user.totpPendingSecret });
}

const SetupSchema = z.object({
  azione: z.literal("setup"),
  // Obbligatorio se un fattore è già attivo: dimostra il possesso del fattore corrente
  // prima di sostituirlo (non deve essere possibile azzerarlo con la sola sessione).
  code: z.string().min(6).max(10).optional(),
});
const EnableSchema = z.object({ azione: z.literal("enable"), code: z.string().min(6).max(10) });
const DisableSchema = z.object({ azione: z.literal("disable"), code: z.string().min(6).max(10) });

export async function POST(req: Request) {
  const id = await identitaCorrente();
  if (!id.ok) {
    if (id.motivo === "no-session") return fail("Non autenticato", 401);
    return fail("Sessione non più valida: accedi di nuovo", 401);
  }
  const { session: s, user: u } = id;
  const body = await req.json().catch(() => null);

  const setup = SetupSchema.safeParse(body);
  if (setup.success) {
    if (u.totpEnabled) {
      if (!setup.data.code || !u.totpSecret || !verifyTotp(u.totpSecret, setup.data.code)) {
        return fail("Per rigenerare la 2FA inserisci il codice attuale", 422);
      }
    }
    const secret = generateSecret();
    // Se un fattore è attivo, il nuovo segreto resta provvisorio: quello vecchio
    // continua a funzionare finché il nuovo non viene confermato.
    await prisma.user.update({
      where: { id: u.id },
      data: u.totpEnabled ? { totpPendingSecret: secret } : { totpSecret: secret, totpEnabled: false },
    });
    return ok({ secret, uri: otpauthUri(secret, s.sub) });
  }

  const enable = EnableSchema.safeParse(body);
  if (enable.success) {
    const candidato = u.totpPendingSecret ?? u.totpSecret;
    if (!candidato) return fail("Prima esegui il setup", 422);
    if (!verifyTotp(candidato, enable.data.code)) return fail("Codice non valido", 422);
    await prisma.user.update({ where: { id: u.id }, data: { totpSecret: candidato, totpPendingSecret: null, totpEnabled: true } });
    await registraAzione({ tenantId: u.tenantId, actorId: u.id, azione: "auth.2fa.enable", entita: "User", entitaId: u.id });
    // Riattesta la 2FA nella sessione corrente (stessa versione, nessun logout).
    await createSession({ ...s, twofa: true, ver: u.sessionVersion });
    return ok({ enabled: true });
  }

  const disable = DisableSchema.safeParse(body);
  if (disable.success) {
    if (!u.totpEnabled) return fail("2FA non attiva", 422);
    if (mustTwoFa(u.role, false)) return fail("La 2FA è obbligatoria per questo ruolo", 422);
    if (!u.totpSecret || !verifyTotp(u.totpSecret, disable.data.code)) return fail("Codice non valido", 422);
    const nuovaVersione = u.sessionVersion + 1;
    await prisma.user.update({
      where: { id: u.id },
      data: { totpEnabled: false, totpSecret: null, totpPendingSecret: null, sessionVersion: nuovaVersione },
    });
    await registraAzione({ tenantId: u.tenantId, actorId: u.id, azione: "auth.2fa.disable", entita: "User", entitaId: u.id });
    // La disattivazione revoca le sessioni esistenti; riemette solo quella corrente senza il fattore.
    await createSession({ ...s, twofa: false, ver: nuovaVersione });
    return ok({ enabled: false });
  }

  return fail("Azione non valida", 422);
}
