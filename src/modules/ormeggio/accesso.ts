import { fail } from "@/lib/api";
import { requireProdotto } from "@/modules/piattaforma/accesso-prodotti";

// Il modulo Ormeggio è utilizzabile solo se l'azienda lo ha abilitato.
export function requireOrmeggio(req: Request) {
  return requireProdotto(req, "ormeggio");
}

// L'accesso agli importi è un permesso separato: spostare una barca non deve
// consentire di leggere o modificare conti, addebiti e incassi.
export async function requireImporti(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t;
  if (t.vedeImporti === false) return { error: fail("Permesso negato: non hai l'accesso agli importi", 403) };
  return t;
}

// Guardia per il modulo Ormeggio: oltre al modulo attivo serve il permesso importi.
export async function requireImportiOrmeggio(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t;
  if (t.vedeImporti === false) return { error: fail("Permesso negato: non hai l'accesso agli importi", 403) };
  return t;
}
