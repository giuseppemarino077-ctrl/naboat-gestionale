import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { InvalidPhotoError, MAX_BYTES, MIME_OK, deletePhoto, savePhoto } from "@/lib/storage";
import { isOwnerOrSuperadmin, requireAzienda } from "@/lib/tenant";

// Logo dell'azienda mostrato nel portale. Immagine ottimizzata come le foto barche.
export async function POST(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  if (!isOwnerOrSuperadmin(t.role)) return fail("Riservato al proprietario", 403);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("file obbligatorio", 422);
  if (!MIME_OK.includes(file.type)) return fail("Solo jpeg/png/webp", 422);
  if (file.size > MAX_BYTES) return fail("Max 5 MB", 422);

  let url: string;
  try {
    url = await savePhoto(t.tenantId, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (error) {
    if (error instanceof InvalidPhotoError) return fail(error.message, 422);
    return fail("Salvataggio logo fallito", 500);
  }

  const precedente = await prisma.tenant.findUnique({ where: { id: t.tenantId }, select: { logoUrl: true } });
  await prisma.tenant.update({ where: { id: t.tenantId }, data: { logoUrl: url } });
  if (precedente?.logoUrl && precedente.logoUrl !== url) await deletePhoto(precedente.logoUrl);

  return ok({ logoUrl: url }, 201);
}
