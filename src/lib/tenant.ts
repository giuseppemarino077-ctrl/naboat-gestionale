import { fail } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { abbonamentoAttivo, abbonamentoRichiesto } from "@/lib/subscriptions";

// Tutte le API operative richiedono tenant attivo.
// Ritorna { userId, tenantId, role } oppure una NextResponse di errore.
// Con { ignoraAbbonamento: true } si salta il controllo dell'abbonamento
// (serve alle API dell'abbonamento stesso, altrimenti l'azienda non potrebbe pagarlo).
export async function requireTenant(req: Request, opts: { ignoraAbbonamento?: boolean } = {}) {
  const s = await getSession();
  if (!s) return { error: fail("Non autenticato", 401) };
  if (s.role === "superadmin") {
    if (mustTwoFa(s.role, s.twofa)) return { error: fail("2FA obbligatoria: abilitala da /sicurezza", 403) };
    const tid = new URL(req.url).searchParams.get("tenantId");
    if (!tid) return { error: fail("Superadmin: specificare ?tenantId=", 400) };
    return { userId: s.sub, tenantId: tid, role: s.role };
  }
  if (!s.tenantId) return { error: fail("Nessuna azienda associata", 403) };
  if (s.tenantStatus !== "active") return { error: fail("Azienda non attiva (in attesa/sospesa)", 403) };
  if (s.role !== "owner" && s.role !== "operatore" && s.role !== "skipper") return { error: fail("Permesso negato", 403) };
  // Lo skipper consulta (uscite, calendario, turni) ma non modifica nulla.
  if (s.role === "skipper" && req.method !== "GET" && req.method !== "HEAD") {
    return { error: fail("Ruolo skipper: sola consultazione", 403) };
  }
  if (mustTwoFa(s.role, s.twofa)) return { error: fail("2FA obbligatoria: abilitala da /sicurezza", 403) };
  if (process.env.REQUIRE_EMAIL_VERIFY === "true") {
    const u = await prisma.user.findUnique({ where: { id: s.sub }, select: { emailVerified: true } });
    if (!u?.emailVerified) return { error: fail("Email non confermata: controlla la posta", 403) };
  }
  if (!opts.ignoraAbbonamento && (await abbonamentoRichiesto())) {
    const attivo = await abbonamentoAttivo(s.tenantId);
    if (!attivo) return { error: fail("Abbonamento non attivo: attivalo dalla pagina Abbonamento", 402) };
  }
  return { userId: s.sub, tenantId: s.tenantId, role: s.role };
}

export function isOwnerOrSuperadmin(role: string) {
  return role === "owner" || role === "superadmin";
}

// Aree riservate a proprietario e operatore: lo skipper non deve vederle
// (margini, anagrafica clienti, incassi, listino, flotta, manutenzione…).
export async function requireAzienda(req: Request, opts: { ignoraAbbonamento?: boolean } = {}) {
  const t = await requireTenant(req, opts);
  if ("error" in t) return t;
  if (t.role === "skipper") return { error: fail("Ruolo skipper: sezione non disponibile", 403) as never };
  return t;
}

// Con REQUIRE_2FA=true owner e superadmin devono avere la 2FA attiva.
export function mustTwoFa(role: string, twofaDone: boolean) {
  return process.env.REQUIRE_2FA === "true" && isOwnerOrSuperadmin(role) && !twofaDone;
}
