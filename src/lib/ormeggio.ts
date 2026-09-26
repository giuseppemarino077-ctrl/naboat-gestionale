import { fail } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";

// Il modulo Ormeggio è utilizzabile solo se l'azienda lo ha abilitato.
export async function requireOrmeggio(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t;
  const tenant = await prisma.tenant.findUnique({ where: { id: t.tenantId }, select: { moduloOrmeggio: true } });
  if (!tenant?.moduloOrmeggio) return { error: fail("Modulo Ormeggio non attivo per questa azienda", 403) };
  return t;
}

// Codice del posto in stile battaglia navale: riga 1 -> A, colonna 1 -> 1 (es. B3).
export function codicePosto(riga: number, colonna: number) {
  return `${String.fromCharCode(64 + riga)}${colonna}`;
}

// Chiave di riuso del proprietario: telefono, altrimenti email, altrimenti nome.
// Serve a riproporre l'anagrafica esistente senza fusioni automatiche.
export function dedupProprietario(p: { nome: string; telefono?: string | null; email?: string | null }) {
  const tel = (p.telefono ?? "").replace(/\D/g, "").slice(-15);
  if (tel) return `t:${tel}`;
  const em = (p.email ?? "").trim().toLowerCase();
  if (em) return `e:${em}`;
  return `n:${p.nome.trim().toLowerCase()}`;
}

// Fine convenzionale per una permanenza senza scadenza: occupa sempre.
export const FINE_APERTA = new Date("9999-12-31T23:59:59.000Z");

// Riconosce la violazione dei vincoli EXCLUDE di Postgres (doppia assegnazione):
// vale anche quando due addetti salvano nello stesso istante. Da tradurre in 409.
export function conflittoPermanenza(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /23P01/.test(msg) || /permanenza_(posto|barca)_senza_sovrapposizioni/.test(msg) || /exclusion constraint/i.test(msg);
}
