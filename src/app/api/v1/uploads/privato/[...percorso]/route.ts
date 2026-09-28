import { NextResponse } from "next/server";
import { normalizzaPercorsoPrivato, leggiFilePrivato } from "@/lib/storage";
import { requireAzienda } from "@/lib/tenant";

// Serve le foto private (check-in/check-out) solo agli utenti dell'azienda a cui
// appartengono. Il primo segmento del percorso è il tenantId: nessun accesso incrociato.
// I file non stanno sotto public/: si leggono dal deposito privato.
const TIPI: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function GET(req: Request, ctx: { params: Promise<{ percorso: string[] }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;

  const { percorso } = await ctx.params;
  const puliti = normalizzaPercorsoPrivato(percorso ?? []);
  if (!puliti) return new NextResponse("Non trovato", { status: 404 });
  const [tenant, ...resto] = puliti;
  if (tenant !== t.tenantId || resto.length === 0) {
    return new NextResponse("Non trovato", { status: 404 });
  }

  const dati = await leggiFilePrivato(puliti);
  if (!dati) return new NextResponse("Non trovato", { status: 404 });
  const ext = resto[resto.length - 1].split(".").pop()?.toLowerCase() ?? "";
  return new NextResponse(new Uint8Array(dati), {
    status: 200,
    headers: {
      "Content-Type": TIPI[ext] ?? "application/octet-stream",
      "Content-Length": String(dati.byteLength),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
