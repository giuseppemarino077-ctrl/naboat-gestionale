import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";
import { InvalidPhotoError, MAX_BYTES, MIME_OK, savePhoto } from "@/lib/storage";

// Upload immagini (multipart). Max 5 MB, jpeg/png/webp. Tre usi:
//   boatId                    -> foto della barca (la prima diventa copertina)
//   bookingId + tipo=checkin  -> foto del check-in alla partenza
//   bookingId + tipo=checkout -> foto del rientro (danni, carburante…)
export async function POST(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file") as File | null;
  const boatId = form?.get("boatId") as string | null;
  const bookingId = form?.get("bookingId") as string | null;
  const tipo = form?.get("tipo") as string | null;

  if (!(file instanceof File)) return fail("file obbligatorio", 422);
  if (!boatId && !bookingId) return fail("Indicare boatId oppure bookingId", 422);
  if (!MIME_OK.includes(file.type)) return fail("Solo jpeg/png/webp", 422);
  if (file.size > MAX_BYTES) return fail("Max 5 MB", 422);

  let barca: { id: string; fotoGallery: string[]; fotoCopertina: string | null } | null = null;
  let prenotazione: { id: string; fotoCheckin: string[]; fotoCheckout: string[] } | null = null;

  if (bookingId) {
    if (tipo !== "checkin" && tipo !== "checkout") return fail("tipo deve essere checkin o checkout", 422);
    prenotazione = await prisma.booking.findFirst({
      where: { id: bookingId, tenantId: t.tenantId },
      select: { id: true, fotoCheckin: true, fotoCheckout: true },
    });
    if (!prenotazione) return fail("Prenotazione non trovata", 404);
  } else {
    barca = await prisma.boat.findFirst({
      where: { id: boatId!, tenantId: t.tenantId },
      select: { id: true, fotoGallery: true, fotoCopertina: true },
    });
    if (!barca) return fail("Barca non trovata", 404);
  }

  let url: string;
  try {
    url = await savePhoto(t.tenantId, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (error) {
    if (error instanceof InvalidPhotoError) return fail(error.message, 422);
    return fail("Salvataggio immagine fallito", 500);
  }

  if (prenotazione) {
    const campo = tipo === "checkin" ? "fotoCheckin" : "fotoCheckout";
    const attuali = campo === "fotoCheckin" ? prenotazione.fotoCheckin : prenotazione.fotoCheckout;
    await prisma.booking.update({
      where: { id: prenotazione.id },
      data: { [campo]: [...attuali, url] },
    });
    return ok({ url, tipo }, 201);
  }

  const copertina = barca!.fotoCopertina;
  await prisma.boat.update({
    where: { id: barca!.id },
    data: { fotoGallery: [...barca!.fotoGallery, url], ...(copertina ? {} : { fotoCopertina: url }) },
  });
  return ok({ url, copertina: copertina ?? url }, 201);
}
