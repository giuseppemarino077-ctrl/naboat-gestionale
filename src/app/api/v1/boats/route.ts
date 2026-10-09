import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/modules/piattaforma/accesso-azienda";
import { prodottiAbilitati } from "@/modules/piattaforma/prodotti";
import { GET as elencoNoleggio, POST as creaNoleggio } from "@/modules/noleggio/server/boats/operazioni";
import { GET as elencoCustodia, POST as creaCustodia } from "@/modules/ormeggio/server/barche/operazioni";

export async function GET(req: Request) {
  const uso = new URL(req.url).searchParams.get("uso");
  if (uso === "custodia") return elencoCustodia(req);
  if (uso !== "tutte") return elencoNoleggio(req);
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const tenant = await prisma.tenant.findUnique({ where: { id: t.tenantId }, select: { tipoModulo: true, moduloOrmeggio: true } });
  const prodotti = prodottiAbilitati(tenant ?? {});
  const risposte = await Promise.all([
    ...(prodotti.noleggio ? [elencoNoleggio(req)] : []),
    ...(prodotti.ormeggio ? [elencoCustodia(req)] : []),
  ]);
  if (risposte.some((r) => !r)) return fail("Lettura barche non riuscita", 500);
  const valide = risposte.filter((r): r is NonNullable<typeof r> => !!r);
  const errore = valide.find((r) => !r.ok);
  if (errore) return errore;
  const liste = await Promise.all(valide.map((r) => r.json()));
  return ok(liste.flat().sort((a, b) => a.nome.localeCompare(b.nome, "it")));
}

export async function POST(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const body = await req.json().catch(() => null);
  const headers = new Headers(req.headers);
  headers.delete("content-length");
  if (body?.uso !== "custodia") return creaNoleggio(new Request(req.url, { method: "POST", headers, body: JSON.stringify(body) }));
  const { uso: _uso, ...dati } = body;
  return creaCustodia(new Request(req.url, { method: "POST", headers, body: JSON.stringify(dati) }));
}
