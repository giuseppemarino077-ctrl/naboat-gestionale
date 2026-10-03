import { fail, ok } from "@/lib/api";
import { generaLinkContratto } from "@/lib/contratto-link";
import { requireAzienda } from "@/lib/tenant";

// Genera (o restituisce) il link del contratto da far firmare al cliente.
// Il documento viene congelato in una versione immutabile: se i dati o il testo
// cambiano si crea una NUOVA revisione da accettare.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await ctx.params;

  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const esito = await generaLinkContratto(t.tenantId, id, base);
  if (!esito.ok) return fail(esito.error, esito.status);
  return ok({ url: esito.url, token: esito.token, versione: esito.versione, hash: esito.hash });
}
