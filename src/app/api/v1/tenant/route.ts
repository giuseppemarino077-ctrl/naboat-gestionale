import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { InvalidPhotoError, MAX_BYTES, MIME_OK, deletePhoto, savePhoto } from "@/lib/storage";
import { isOwnerOrSuperadmin, requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Campi pubblici del profilo dell'azienda restituiti al portale (compreso lo slug
// in sola lettura: lo assegna NaBoat con la SEO).
const SELETTORE = {
  id: true,
  nome: true,
  logoUrl: true,
  indirizzoPartenza: true,
  telefonoContatto: true,
  status: true,
  slug: true,
  verificata: true,
  copertinaUrl: true,
  citta: true,
  annoFondazione: true,
  descrizione: true,
  lingue: true,
  orarioImbarco: true,
  orarioRientro: true,
  politicaCancellazione: true,
  sito: true,
  social: true,
  mostraEmail: true,
  mostraTelefono: true,
  mostraSocial: true,
  mostraRecensioni: true,
  mostraChiSiamo: true,
  mostraPorti: true,
} as const;

// Dati dell'azienda mostrati nel portale e usati per il profilo pubblico.
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const tenant = await prisma.tenant.findUnique({ where: { id: t.tenantId }, select: SELETTORE });
  if (!tenant) return fail("Azienda non trovata", 404);
  return ok(tenant);
}

// Normalizza un indirizzo digitato senza schema ("www.esempio.it" -> "https://...").
function urlPulita(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

const Schema = z.object({
  nome: z.string().trim().min(2).max(120).optional(),
  logoUrl: z.string().max(500).optional().nullable(),
  indirizzoPartenza: z.string().max(200).optional().nullable(),
  telefonoContatto: z.string().max(40).optional().nullable(),
  // --- Profilo pubblico ---
  copertinaUrl: z.string().max(500).optional().nullable(),
  citta: z.string().trim().max(120).optional().nullable(),
  annoFondazione: z.number().int().min(1800).max(2100).optional().nullable(),
  descrizione: z.string().trim().max(2000).optional().nullable(),
  lingue: z.string().trim().max(200).optional().nullable(),
  orarioImbarco: z.string().trim().max(60).optional().nullable(),
  orarioRientro: z.string().trim().max(60).optional().nullable(),
  politicaCancellazione: z.string().trim().max(1000).optional().nullable(),
  sito: z.string().trim().max(300).optional().nullable(),
  social: z.string().trim().max(300).optional().nullable(),
  mostraEmail: z.boolean().optional(),
  mostraTelefono: z.boolean().optional(),
  mostraSocial: z.boolean().optional(),
  mostraRecensioni: z.boolean().optional(),
  mostraChiSiamo: z.boolean().optional(),
  mostraPorti: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  if (!isOwnerOrSuperadmin(t.role)) return fail("Riservato al proprietario", 403);
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const d = p.data;
  if (Object.values(d).every((v) => v === undefined)) return fail("Nessuna modifica richiesta", 422);

  const vuoto = (v: string | null | undefined) => (v == null || v.trim() === "" ? null : v.trim());

  const tenant = await prisma.tenant.update({
    where: { id: t.tenantId },
    data: {
      ...(d.nome !== undefined ? { nome: d.nome.trim() } : {}),
      ...(d.logoUrl !== undefined ? { logoUrl: d.logoUrl } : {}),
      ...(d.indirizzoPartenza !== undefined ? { indirizzoPartenza: vuoto(d.indirizzoPartenza) } : {}),
      ...(d.telefonoContatto !== undefined ? { telefonoContatto: vuoto(d.telefonoContatto) } : {}),
      ...(d.copertinaUrl !== undefined ? { copertinaUrl: d.copertinaUrl } : {}),
      ...(d.citta !== undefined ? { citta: vuoto(d.citta) } : {}),
      ...(d.annoFondazione !== undefined ? { annoFondazione: d.annoFondazione } : {}),
      ...(d.descrizione !== undefined ? { descrizione: vuoto(d.descrizione) } : {}),
      ...(d.lingue !== undefined ? { lingue: vuoto(d.lingue) } : {}),
      ...(d.orarioImbarco !== undefined ? { orarioImbarco: vuoto(d.orarioImbarco) } : {}),
      ...(d.orarioRientro !== undefined ? { orarioRientro: vuoto(d.orarioRientro) } : {}),
      ...(d.politicaCancellazione !== undefined ? { politicaCancellazione: vuoto(d.politicaCancellazione) } : {}),
      ...(d.sito !== undefined ? { sito: urlPulita(d.sito) } : {}),
      ...(d.social !== undefined ? { social: urlPulita(d.social) } : {}),
      ...(d.mostraEmail !== undefined ? { mostraEmail: d.mostraEmail } : {}),
      ...(d.mostraTelefono !== undefined ? { mostraTelefono: d.mostraTelefono } : {}),
      ...(d.mostraSocial !== undefined ? { mostraSocial: d.mostraSocial } : {}),
      ...(d.mostraRecensioni !== undefined ? { mostraRecensioni: d.mostraRecensioni } : {}),
      ...(d.mostraChiSiamo !== undefined ? { mostraChiSiamo: d.mostraChiSiamo } : {}),
      ...(d.mostraPorti !== undefined ? { mostraPorti: d.mostraPorti } : {}),
    },
    select: SELETTORE,
  });
  await prisma.auditLog.create({
    data: { tenantId: t.tenantId, actorId: t.userId, azione: "azienda.modificata", entita: "Tenant", entitaId: t.tenantId },
  });
  return ok(tenant);
}

// Foto di copertina del profilo pubblico: stesso trattamento delle altre immagini.
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
    url = await savePhoto("copertine", Buffer.from(await file.arrayBuffer()), file.type);
  } catch (error) {
    if (error instanceof InvalidPhotoError) return fail(error.message, 422);
    return fail("Salvataggio immagine fallito", 500);
  }

  const precedente = await prisma.tenant.findUnique({ where: { id: t.tenantId }, select: { copertinaUrl: true } });
  await prisma.tenant.update({ where: { id: t.tenantId }, data: { copertinaUrl: url } });
  if (precedente?.copertinaUrl && precedente.copertinaUrl !== url) await deletePhoto(precedente.copertinaUrl);
  await prisma.auditLog.create({
    data: { tenantId: t.tenantId, actorId: t.userId, azione: "azienda.copertina", entita: "Tenant", entitaId: t.tenantId },
  });
  return ok({ copertinaUrl: url }, 201);
}
