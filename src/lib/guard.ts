import { fail } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { mustTwoFa } from "@/lib/tenant";

export async function requireSuperadmin() {
  const s = await getSession();
  if (!s) return { error: fail("Non autenticato", 401) as never };
  // Ruolo e versione letti dal database: un ruolo revocato o una sessione invalidata
  // non restano utilizzabili fino alla scadenza del gettone.
  const u = await prisma.user.findUnique({ where: { id: s.sub }, select: { id: true, role: true, sessionVersion: true } });
  if (!u || u.role !== "superadmin") return { error: fail("Riservato a NaBoat", 403) as never };
  if ((s.ver ?? 0) !== u.sessionVersion) return { error: fail("Sessione scaduta: accedi di nuovo", 401) as never };
  if (mustTwoFa(u.role, s.twofa)) return { error: fail("2FA obbligatoria: abilitala da /sicurezza", 403) as never };
  return { session: s };
}
