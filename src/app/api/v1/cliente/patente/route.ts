import { fail, ok } from "@/lib/api";
import { requireCliente } from "@/lib/clienti";
import { cifra } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { InvalidPhotoError, MAX_BYTES, MIME_OK, deletePhoto, savePhoto } from "@/lib/storage";

// Caricamento della patente nautica: la foto va in archivio privato (mai raggiungibile
// dal web) e il numero viene cifrato a riposo. Serve la verifica dello staff NaBoat.
// La scadenza del documento è facoltativa ma, se nota e passata, la verifica non vale.
export async function POST(req: Request) {
  const g = await requireCliente();
  if ("error" in g) return g.error;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const numero = String(form?.get("numero") ?? "").trim();
  const scadenzaRaw = String(form?.get("scadenza") ?? "").trim();
  if (!(file instanceof File)) return fail("foto obbligatoria", 422);
  if (numero.length < 4 || numero.length > 60) return fail("Numero della patente non valido", 422);
  if (!MIME_OK.includes(file.type)) return fail("Solo jpeg/png/webp", 422);
  if (file.size > MAX_BYTES) return fail("Max 5 MB", 422);

  let scadenzaAt: Date | null = null;
  if (scadenzaRaw) {
    const d = new Date(scadenzaRaw);
    if (Number.isNaN(d.getTime())) return fail("Data di scadenza non valida", 422);
    scadenzaAt = d;
  }

  let url: string;
  try {
    url = await savePhoto(`patenti-${g.account.id}`, Buffer.from(await file.arrayBuffer()), file.type, { privato: true });
  } catch (error) {
    if (error instanceof InvalidPhotoError) return fail(error.message, 422);
    return fail("Salvataggio immagine fallito", 500);
  }

  const precedente = await prisma.patenteNautica.findUnique({ where: { accountId: g.account.id }, select: { fotoUrl: true, scadenzaAt: true } });
  // Se il modulo non riporta la scadenza si conserva quella già nota (non si azzera).
  const scadenzaFinale = scadenzaRaw ? scadenzaAt : precedente?.scadenzaAt ?? null;
  const patente = await prisma.patenteNautica.upsert({
    where: { accountId: g.account.id },
    update: { numeroCifrato: cifra(numero), fotoUrl: url, scadenzaAt: scadenzaFinale, stato: "in_verifica", motivoRifiuto: null, verificataAt: null, verificatoDa: null },
    create: { accountId: g.account.id, numeroCifrato: cifra(numero), fotoUrl: url, scadenzaAt: scadenzaFinale },
  });
  if (precedente?.fotoUrl && precedente.fotoUrl !== url) await deletePhoto(precedente.fotoUrl);

  return ok({ stato: patente.stato, scadenzaAt: patente.scadenzaAt }, 201);
}

export async function DELETE() {
  const g = await requireCliente();
  if ("error" in g) return g.error;
  const p = await prisma.patenteNautica.findUnique({ where: { accountId: g.account.id }, select: { fotoUrl: true } });
  if (p) await prisma.patenteNautica.delete({ where: { accountId: g.account.id } });
  if (p?.fotoUrl) await deletePhoto(p.fotoUrl);
  return ok({ ok: true });
}
