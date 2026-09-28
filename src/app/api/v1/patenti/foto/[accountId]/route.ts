import { NextResponse } from "next/server";
import { requireCliente } from "@/lib/clienti";
import { prisma } from "@/lib/db";
import { identitaCorrente } from "@/lib/identita";
import { leggiFilePrivato } from "@/lib/storage";

// Serve la foto della patente solo a chi è autorizzato: il proprietario dell'account
// o lo staff NaBoat (superadmin). Il ruolo è sempre riverificato sul database.
export async function GET(_req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  let autorizzato = false;
  const id = await identitaCorrente();
  if (id.ok && id.user.role === "superadmin") autorizzato = true;
  if (!autorizzato) {
    const g = await requireCliente();
    if (!("error" in g) && g.account.id === accountId) autorizzato = true;
  }
  if (!autorizzato) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });

  const p = await prisma.patenteNautica.findUnique({ where: { accountId }, select: { fotoUrl: true } });
  if (!p) return NextResponse.json({ error: "Non trovata" }, { status: 404 });

  try {
    const segmenti = p.fotoUrl.replace("/api/v1/uploads/privato/", "").split("/");
    const buf = await leggiFilePrivato(segmenti);
    if (!buf) return NextResponse.json({ error: "File non disponibile" }, { status: 404 });
    const body = new ArrayBuffer(buf.byteLength);
    new Uint8Array(body).set(buf);
    return new Response(body, { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "File non disponibile" }, { status: 404 });
  }
}
