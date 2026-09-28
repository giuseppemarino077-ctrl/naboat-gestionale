import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { join, normalize } from "path";
import { requireAzienda } from "@/lib/tenant";

// Serve le foto private (check-in/check-out) solo agli utenti dell'azienda a cui
// appartengono. Il primo segmento del percorso è il tenantId: nessun accesso incrociato.
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
  const [tenant, ...resto] = percorso ?? [];
  if (!tenant || tenant !== t.tenantId || resto.length === 0) {
    return new NextResponse("Non trovato", { status: 404 });
  }

  const relativo = resto.join("/");
  const base = normalize(join(process.cwd(), "public", "uploads", "privato", tenant));
  const file = normalize(join(base, relativo));
  if (!file.startsWith(base) || relativo.includes("..")) {
    return new NextResponse("Non trovato", { status: 404 });
  }

  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error("non è un file");
    const dati = await readFile(file);
    const ext = relativo.split(".").pop()?.toLowerCase() ?? "";
    return new NextResponse(new Uint8Array(dati), {
      status: 200,
      headers: {
        "Content-Type": TIPI[ext] ?? "application/octet-stream",
        "Content-Length": String(info.size),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Non trovato", { status: 404 });
  }
}
