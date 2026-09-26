import { fail } from "@/lib/api";
import { getSession } from "@/lib/session";
import { mustTwoFa } from "@/lib/tenant";

export async function requireSuperadmin() {
  const s = await getSession();
  if (!s) return { error: fail("Non autenticato", 401) as never };
  if (s.role !== "superadmin") return { error: fail("Riservato a NaBoat", 403) as never };
  if (mustTwoFa(s.role, s.twofa)) return { error: fail("2FA obbligatoria: abilitala da /sicurezza", 403) as never };
  return { session: s };
}
