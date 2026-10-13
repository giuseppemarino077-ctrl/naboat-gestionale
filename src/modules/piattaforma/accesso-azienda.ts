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

  // Controllo dal database a ogni richiesta: l'utente può essere stato eliminato,
  // l'azienda sospesa, oppure ruolo/password cambiati (sessionVersion). Così i gettoni
  // già emessi non restano validi fino alla scadenza.
  const u = await prisma.user.findUnique({
    where: { id: s.sub },
    select: {
      id: true,
      role: true,
      emailVerified: true,
      tenantId: true,
      vedeImporti: true,
      sessionVersion: true,
      tenant: { select: { status: true } },
    },
  });
  if (!u) return { error: fail("Sessione non più valida: accedi di nuovo", 401) };
  if ((s.ver ?? 0) !== u.sessionVersion) return { error: fail("Sessione scaduta: accedi di nuovo", 401) };

  if (u.role === "superadmin") {
    if (mustTwoFa(u.role, s.twofa)) return { error: fail("2FA obbligatoria: abilitala da /gestionale/impostazioni/sicurezza", 403) };
    const tid = new URL(req.url).searchParams.get("tenantId");
    if (!tid) return { error: fail("Superadmin: specificare ?tenantId=", 400) };
    return { userId: u.id, tenantId: tid, role: u.role, vedeImporti: true, ruoloOrmeggio: "responsabile" as const, accessoNoleggio: true, accessoOrmeggio: true };
  }

  const appartenenza = s.tenantId ? await prisma.appartenenza.findUnique({
    where: { tenantId_userId: { tenantId: s.tenantId, userId: u.id } },
    include: { tenant: { select: { status: true, tipoModulo: true, moduloOrmeggio: true } } },
  }) : null;
  if (!appartenenza || appartenenza.stato !== "attiva") return { error: fail("Accesso all'azienda revocato o sospeso", 403) };
  const tenantStatus = appartenenza.tenant.status;
  if (tenantStatus !== "active") return { error: fail("Azienda non attiva (in attesa/sospesa)", 403) };
  const role = appartenenza.role;
  const profiloLimitato = role !== "owner" && appartenenza.accessoOrmeggio && appartenenza.ruoloOrmeggio !== "responsabile";
  const percorso = new URL(req.url).pathname;
  if (profiloLimitato && !percorso.startsWith("/api/v1/ormeggio/") && !percorso.startsWith("/api/v1/auth/")) {
    return { error: fail("Sezione non disponibile per il tuo ruolo", 403) };
  }
  if (role !== "owner" && appartenenza.accessoOrmeggio && /\/api\/v1\/(subscription|tenant|users)(\/|$)/.test(percorso)) {
    return { error: fail("Riservato al titolare", 403) };
  }
  if (role !== "owner" && appartenenza.accessoOrmeggio && !appartenenza.vedeImporti && percorso.startsWith("/api/v1/audit")) return { error: fail("Registro riservato", 403) };

  if (role !== "owner" && role !== "operatore" && role !== "skipper") return { error: fail("Permesso negato", 403) };
  // Lo skipper consulta (uscite, calendario, turni) ma non modifica nulla.
  if (role === "skipper" && req.method !== "GET" && req.method !== "HEAD") {
    return { error: fail("Ruolo skipper: sola consultazione", 403) };
  }
  if (mustTwoFa(role, s.twofa)) return { error: fail("2FA obbligatoria: abilitala da /gestionale/impostazioni/sicurezza", 403) };
  if (process.env.REQUIRE_EMAIL_VERIFY === "true" && !u.emailVerified) {
    return { error: fail("Email non confermata: controlla la posta", 403) };
  }
  if (!opts.ignoraAbbonamento && (await abbonamentoRichiesto())) {
    const attivo = await abbonamentoAttivo(appartenenza.tenantId);
    if (!attivo) return { error: fail("Abbonamento non attivo: attivalo dalla pagina Abbonamento", 402) };
  }
  return { userId: u.id, tenantId: appartenenza.tenantId, role, vedeImporti: role === "owner" || appartenenza.vedeImporti, ruoloOrmeggio: appartenenza.ruoloOrmeggio, accessoNoleggio: role === "owner" ? !appartenenza.tenant.moduloOrmeggio || appartenenza.tenant.tipoModulo === "entrambi" : appartenenza.accessoNoleggio, accessoOrmeggio: role === "owner" ? appartenenza.tenant.moduloOrmeggio : appartenenza.accessoOrmeggio };
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

// Il permesso sugli importi vale in tutte le aree (azienda): chi non lo ha non legge
// né scrive cifre economiche.
export function puoVedereImporti(t: { vedeImporti?: boolean | null }): boolean {
  return t.vedeImporti !== false;
}

// Con REQUIRE_2FA=true owner e superadmin devono avere la 2FA attiva.
export function mustTwoFa(role: string, twofaDone: boolean) {
  return process.env.REQUIRE_2FA === "true" && isOwnerOrSuperadmin(role) && !twofaDone;
}
