import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import { join, normalize } from "path";

// Serve i file caricati (foto barche, loghi, sfondi, foto di check-in/out).
// Serve una rotta dedicata: in produzione Next.js non serve i file aggiunti a
// public/ dopo la compilazione, quindi le immagini caricate darebbero 404.
const TIPI: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  avif: "image/avif",
};

export async function GET(req: Request, ctx: { params: Promise<{ percorso: string[] }> }) {
  const { percorso } = await ctx.params;
  const relativo = (percorso ?? []).join("/");

  // Le foto private (check-in/check-out) non si servono da qui: solo dalla rotta autenticata.
  if (relativo === "privato" || relativo.startsWith("privato/")) {
    return new NextResponse("Non trovato", { status: 404 });
  }

  // Nessun percorso che esca dalla cartella dei caricamenti.
  const base = normalize(join(process.cwd(), "public", "uploads"));
  const file = normalize(join(base, relativo));
  if (!file.startsWith(base) || relativo.includes("..")) {
    return new NextResponse("Percorso non valido", { status: 400 });
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
        // I file caricati non cambiano mai nome: si possono tenere in cache a lungo.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("File non trovato", { status: 404 });
  }
}
