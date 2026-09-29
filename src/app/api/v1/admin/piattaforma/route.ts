import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";
import { InvalidPhotoError, MAX_BYTES, MIME_OK, deletePhoto, savePhoto } from "@/lib/storage";
import { z } from "zod";

// Aspetto del portale: pagina di accesso e home del sito pubblico (naboat.it).
export async function GET() {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const s = await prisma.platformSettings.findUnique({
    where: { id: "singleton" },
    select: {
      loginImmagine: true,
      loginSfocatura: true,
      loginMessaggio: true,
      homeTitolo: true,
      homeSottotitolo: true,
      homeImmagine: true,
      manutenzioneAttiva: true,
      manutenzioneTitolo: true,
      manutenzioneTesto: true,
      sogliaPatenteCv: true,
      tempoPreparazioneMin: true,
      finestraRecensioniGiorni: true,
      pianoFreeMaxBarche: true,
      pianoFreeMaxFoto: true,
      pianoProPrezzoMensileCent: true,
      pianoProPrezzoAnnualeCent: true,
      pianoProvaGiorni: true,
      opzioneScadenzaOre: true,
      richiestaMaxDurataGiorni: true,
      richiestaMaxAnticipoGiorni: true,
    },
  });
  return ok({
    loginImmagine: s?.loginImmagine ?? null,
    loginSfocatura: s?.loginSfocatura ?? 0,
    loginMessaggio: s?.loginMessaggio ?? "",
    homeTitolo: s?.homeTitolo ?? "",
    homeSottotitolo: s?.homeSottotitolo ?? "",
    homeImmagine: s?.homeImmagine ?? null,
    manutenzioneAttiva: s?.manutenzioneAttiva ?? false,
    manutenzioneTitolo: s?.manutenzioneTitolo ?? "",
    manutenzioneTesto: s?.manutenzioneTesto ?? "",
    sogliaPatenteCv: s?.sogliaPatenteCv ?? 40,
    tempoPreparazioneMin: s?.tempoPreparazioneMin ?? 0,
    finestraRecensioniGiorni: s?.finestraRecensioniGiorni ?? 60,
    pianoFreeMaxBarche: s?.pianoFreeMaxBarche ?? 3,
    pianoFreeMaxFoto: s?.pianoFreeMaxFoto ?? 5,
    pianoProPrezzoMensileCent: s?.pianoProPrezzoMensileCent ?? null,
    pianoProPrezzoAnnualeCent: s?.pianoProPrezzoAnnualeCent ?? null,
    pianoProvaGiorni: s?.pianoProvaGiorni ?? 0,
    opzioneScadenzaOre: s?.opzioneScadenzaOre ?? 48,
    richiestaMaxDurataGiorni: s?.richiestaMaxDurataGiorni ?? 30,
    richiestaMaxAnticipoGiorni: s?.richiestaMaxAnticipoGiorni ?? 730,
    predefinita: "/img/sfondo-login.jpg",
  });
}

const Schema = z
  .object({
    loginImmagine: z.string().max(500).optional().nullable(),
    loginSfocatura: z.number().int().min(0).max(10).optional(),
    loginMessaggio: z.string().max(200).optional().nullable(),
    homeTitolo: z.string().max(160).optional().nullable(),
    homeSottotitolo: z.string().max(400).optional().nullable(),
    homeImmagine: z.string().max(500).optional().nullable(),
    manutenzioneAttiva: z.boolean().optional(),
    manutenzioneTitolo: z.string().max(160).optional().nullable(),
    manutenzioneTesto: z.string().max(600).optional().nullable(),
    sogliaPatenteCv: z.number().int().min(0).max(2000).optional(),
    tempoPreparazioneMin: z.number().int().min(0).max(10080).optional(),
    finestraRecensioniGiorni: z.number().int().min(1).max(365).optional(),
    pianoFreeMaxBarche: z.number().int().min(0).max(10000).optional(),
    pianoFreeMaxFoto: z.number().int().min(0).max(10000).optional(),
    pianoProPrezzoMensileCent: z.number().int().min(0).max(100000000).optional().nullable(),
    pianoProPrezzoAnnualeCent: z.number().int().min(0).max(100000000).optional().nullable(),
    pianoProvaGiorni: z.number().int().min(0).max(3650).optional(),
    opzioneScadenzaOre: z.number().int().min(1).max(720).optional(),
    richiestaMaxDurataGiorni: z.number().int().min(1).max(365).optional(),
    richiestaMaxAnticipoGiorni: z.number().int().min(1).max(3650).optional(),
  })
  .strict();

export async function PATCH(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);

  const precedente = await prisma.platformSettings.findUnique({
    where: { id: "singleton" },
    select: { loginImmagine: true, homeImmagine: true },
  });
  const salvato = await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    update: p.data,
    create: { id: "singleton", ...p.data },
  });

  // Se si cambia o si toglie un'immagine, quella vecchia (se caricata da qui) si elimina.
  if (p.data.loginImmagine !== undefined && precedente?.loginImmagine && precedente.loginImmagine !== p.data.loginImmagine) {
    await deletePhoto(precedente.loginImmagine);
  }
  if (p.data.homeImmagine !== undefined && precedente?.homeImmagine && precedente.homeImmagine !== p.data.homeImmagine) {
    await deletePhoto(precedente.homeImmagine);
  }

  await prisma.auditLog.create({ data: { actorId: g.session.sub, azione: "piattaforma.aspetto", entita: "PlatformSettings", entitaId: salvato.id } });
  return ok({ salvato: true });
}

// Caricamento immagine (file immagine, ottimizzato come le altre).
// Il campo «campo» decide se è la foto dell'accesso o quella di apertura della home.
export async function POST(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("file obbligatorio", 422);
  if (!MIME_OK.includes(file.type)) return fail("Solo jpeg/png/webp", 422);
  if (file.size > MAX_BYTES) return fail("Max 5 MB", 422);

  const perLaHome = form?.get("campo") === "homeImmagine";

  let url: string;
  try {
    url = await savePhoto("piattaforma", Buffer.from(await file.arrayBuffer()), file.type);
  } catch (error) {
    if (error instanceof InvalidPhotoError) return fail(error.message, 422);
    return fail("Salvataggio immagine fallito", 500);
  }

  const precedente = await prisma.platformSettings.findUnique({
    where: { id: "singleton" },
    select: { loginImmagine: true, homeImmagine: true },
  });
  const dati = perLaHome ? { homeImmagine: url } : { loginImmagine: url };
  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    update: dati,
    create: { id: "singleton", ...dati },
  });

  const vecchia = perLaHome ? precedente?.homeImmagine : precedente?.loginImmagine;
  if (vecchia && vecchia !== url) await deletePhoto(vecchia);

  return ok(perLaHome ? { homeImmagine: url } : { loginImmagine: url }, 201);
}
