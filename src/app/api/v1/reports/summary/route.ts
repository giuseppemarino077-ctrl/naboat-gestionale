import { fail, ok } from "@/lib/api";
import { parsePeriodo, riepilogo, riepilogoCsv } from "@/lib/reports";
import { requireAzienda } from "@/lib/tenant";

// Resoconto economico: incassi, spese, margine, per barca e per canale.
// Con ?format=csv scarica il file per Excel.
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const url = new URL(req.url);

  let periodo;
  try {
    periodo = parsePeriodo(url);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Periodo non valido", 422);
  }

  const dati = await riepilogo(t.tenantId, periodo);

  if (url.searchParams.get("format") === "csv") {
    const csv = "\uFEFF" + riepilogoCsv(dati);
    const nome = `resoconto-${periodo.from.toISOString().slice(0, 10)}_${periodo.to.toISOString().slice(0, 10)}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nome}"`,
      },
    });
  }

  return ok(dati);
}
