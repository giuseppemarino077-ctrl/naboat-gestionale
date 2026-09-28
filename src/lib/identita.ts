import { prisma } from "@/lib/db";
import { getSession, type SessionPayload } from "@/lib/session";

// Identità corrente verificata sul database.
// Distinta da requireTenant: serve agli ingressi che devono restare accessibili
// (pagina di attesa, sicurezza, verifica email, profilo) senza richiedere
// un'azienda pienamente operativa. Verifica sempre che l'utente esista ancora
// e che la versione della sessione coincida: un gettone revocato non basta.

export type UtenteIdentita = {
  id: string;
  role: string;
  emailVerified: boolean;
  tenantId: string | null;
  vedeImporti: boolean;
  sessionVersion: number;
  totpEnabled: boolean;
  totpSecret: string | null;
  totpPendingSecret: string | null;
  tenantStatus: string | null;
};

export type EsitoIdentita =
  | { ok: true; session: SessionPayload; user: UtenteIdentita }
  | { ok: false; motivo: "no-session" | "no-user" | "stale" };

export async function identitaCorrente(): Promise<EsitoIdentita> {
  const s = await getSession();
  if (!s) return { ok: false, motivo: "no-session" };
  const u = await prisma.user.findUnique({
    where: { id: s.sub },
    select: {
      id: true,
      role: true,
      emailVerified: true,
      tenantId: true,
      vedeImporti: true,
      sessionVersion: true,
      totpEnabled: true,
      totpSecret: true,
      totpPendingSecret: true,
      tenant: { select: { status: true } },
    },
  });
  if (!u) return { ok: false, motivo: "no-user" };
  if ((s.ver ?? 0) !== u.sessionVersion) return { ok: false, motivo: "stale" };
  const { tenant, ...resto } = u;
  return { ok: true, session: s, user: { ...resto, tenantStatus: tenant?.status ?? null } };
}
