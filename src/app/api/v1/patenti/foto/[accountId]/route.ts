import { readFile } from "fs/promises";
import { join, normalize } from "path";
import { NextResponse } from "next/server";
import { requireCliente } from "@/lib/clienti";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

// Serve la foto della patente solo a chi è autorizzato: il proprietario dell'account
// o lo staff NaBoat (superadmin). Non è raggiungibile senza autenticazione.
export async function GET(_req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const s = await getSession();
  let autorizzato = false;
  if (s?.role === "superadmin") autorizzato = true;
  else {
    const g = await requireCliente();
    if (!("error" in g) && g.account.id === accountId) autorizzato = true;
  }
  if (!autorizzato) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });

  const p = await prisma.patenteNautica.findUnique({ where: { accountId }, select: { fotoUrl: true } });
  if (!p) return NextResponse.json({ error: "Non trovata" }, { status: 404 });

  try {
    const rel = p.fotoUrl.replace("/api/v1/uploads/privato/", "privato/");
    const base = normalize(join(process.cwd(), "public", "uploads"));
    const file = normalize(join(base, rel));
    if (!file.startsWith(base)) return NextResponse.json({ error: "Percorso non valido" }, { status: 400 });
    const buf = await readFile(file);
    const body = new ArrayBuffer(buf.byteLength);
    new Uint8Array(body).set(buf);
    return new Response(body, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "File non disponibile" }, { status: 404 });
  }
}
