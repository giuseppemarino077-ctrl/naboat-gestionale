import { fail } from "@/lib/api";
import { requireProdotto } from "@/modules/piattaforma/accesso-prodotti";

// Il modulo Ormeggio è utilizzabile solo se l'azienda lo ha abilitato.
export async function requireOrmeggio(req: Request) {
  const t = await requireProdotto(req, "ormeggio");
  if ("error" in t || t.role === "owner" || t.role === "superadmin") return t;
  const path = new URL(req.url).pathname.replace(/^\/api\/v1\/ormeggio\//, "");
  const read = req.method === "GET" || req.method === "HEAD";
  if (t.ruoloOrmeggio === "visualizzazione") {
    return { error: fail("Questo profilo non è più disponibile. Chiedi al titolare di assegnarti il ruolo Responsabile o Addetto", 403) };
  } else if (t.ruoloOrmeggio === "addetto") {
    const allowed = read ? /^(griglia|aree|movimenti|attivita|barche-operative|permanenze\/[^/]+)$/.test(path) : (req.method === "PATCH" && /^(attivita|permanenze)\/[^/]+$/.test(path)) || (req.method === "POST" && ["movimenti", "permanenze"].includes(path));
    if (!allowed) return { error: fail("Operazione non consentita al profilo Addetto", 403) };
  } else if (!read && /^(aree|posti|servizi)(\/|$)/.test(path)) return { error: fail("Configurazione riservata al titolare", 403) };
  return t;
}

export function profiloOperativoLimitato(t: { role: string; ruoloOrmeggio?: string }) {
  return t.role !== "owner" && t.role !== "superadmin" && t.ruoloOrmeggio !== "responsabile";
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
