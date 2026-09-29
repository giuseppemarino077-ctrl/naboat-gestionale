import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { bloccaPiano, verificaFotoPiano } from "@/lib/piani";
import { requireAzienda } from "@/lib/tenant";
import { InvalidPhotoError, MAX_BYTES, MIME_OK, deletePhoto, savePhoto } from "@/lib/storage";

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
    // Le foto di check-in/check-out ritraggono beni e persone del cliente:
    // restano private e si servono solo agli utenti dell'azienda (rotta autenticata).
    url = await savePhoto(t.tenantId, Buffer.from(await file.arrayBuffer()), file.type, { privato: !!prenotazione });
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

  // Limite foto del piano Free applicato in transazione, con il lock del piano:
  // due caricamenti simultanei non superano il tetto. Vale per le barche già in catalogo.
  const esito = await prisma.$transaction(async (tx) => {
    await bloccaPiano(tx, t.tenantId);
    const b = await tx.boat.findFirst({
      where: { id: barca!.id, tenantId: t.tenantId },
      select: { fotoGallery: true, fotoCopertina: true, pubblicata: true, inPausa: true, bloccataAdmin: true },
    });
    if (!b) return { ok: false as const, errore: "Barca non trovata", stato: 404 };
    const nuovaGallery = [...b.fotoGallery, url];
    if (b.pubblicata && !b.inPausa && !b.bloccataAdmin) {
      const lim = await verificaFotoPiano(tx, t.tenantId, nuovaGallery.length);
      if (!lim.ok) return { ok: false as const, errore: lim.messaggio, stato: 402 };
    }
    await tx.boat.update({
      where: { id: barca!.id },
      data: { fotoGallery: nuovaGallery, ...(b.fotoCopertina ? {} : { fotoCopertina: url }) },
    });
    return { ok: true as const, copertina: b.fotoCopertina ?? url };
  });
  if (!esito.ok) {
    await deletePhoto(url);
    return fail(esito.errore, esito.stato);
  }
  return ok({ url, copertina: esito.copertina }, 201);
}
