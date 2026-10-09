import { fail, ok } from "@/lib/api";
import { requireOrmeggio } from "@/modules/ormeggio/accesso";
import { DatiBarcaCustodia, barcaCustodia, salvaBarcaCustodia } from "@/modules/ormeggio/barche";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const barca = await barcaCustodia(t.tenantId, id);
  return barca ? ok(barca) : fail("Barca non trovata", 404);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = DatiBarcaCustodia.refine((v) => Object.keys(v).length > 0).safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati barca non validi", 422);
  const esito = await salvaBarcaCustodia(t, p.data, id);
  if ("error" in esito) return fail(esito.error!, esito.status);
  return ok(esito.barca);
}
