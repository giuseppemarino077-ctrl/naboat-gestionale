import { fail, ok } from "@/lib/api";
import { requireOrmeggio } from "@/modules/ormeggio/accesso";
import { DatiBarcaCustodia, elencoBarcheCustodia, salvaBarcaCustodia } from "@/modules/ormeggio/barche";

export async function GET(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  return ok(await elencoBarcheCustodia(t.tenantId, new URL(req.url).searchParams.get("archiviate") === "1"));
}

export async function POST(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const p = DatiBarcaCustodia.required({ nome: true }).safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati barca non validi", 422);
  const esito = await salvaBarcaCustodia(t, p.data);
  if ("error" in esito) return fail(esito.error!, esito.status);
  return ok(esito.barca, 201);
}
