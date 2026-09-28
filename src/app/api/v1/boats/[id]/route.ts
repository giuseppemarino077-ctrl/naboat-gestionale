import { fail, ok } from "@/lib/api";
import { traccia } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { deletePhoto } from "@/lib/storage";
import { rigeneraBarca } from "@/lib/seo";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

const Schema = z.object({
  nome: z.string().min(2).max(120).optional(),
  tipo: z.string().max(40).optional().nullable(),
  capienza: z.number().int().min(1).max(60).optional(),
  potenzaCv: z.number().int().min(0).max(2000).optional().nullable(),
  patenteRichiesta: z.boolean().optional(),
  stato: z.enum(["disponibile", "non_disponibile", "manutenzione"]).optional(),
  fotoCopertina: z.string().max(500).optional().nullable(),
  rimuoviFoto: z.string().max(500).optional(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lon: z.number().min(-180).max(180).optional().nullable(),
  portoId: z.string().uuid().optional().nullable(),
  modelloId: z.string().uuid().optional().nullable(),
  descrizione: z.string().max(3000).optional().nullable(),
  lunghezzaM: z.number().min(0).max(200).optional().nullable(),
  cabine: z.number().int().min(0).max(30).optional().nullable(),
  dotazioni: z.array(z.string().max(60)).max(40).optional(),
  carburante: z.string().max(80).optional().nullable(),
  cauzioneCent: z.number().int().min(0).max(100000000).optional().nullable(),
  etaMinima: z.number().int().min(0).max(99).optional().nullable(),
  pubblicata: z.boolean().optional(),
  inPausa: z.boolean().optional(),
  archiviato: z.boolean().optional(),
  ordineFoto: z.array(z.string().max(500)).max(60).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const cur = await prisma.boat.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!cur) return fail("Barca non trovata", 404);

  let gallery = cur.fotoGallery;
  let copertina = p.data.fotoCopertina !== undefined ? p.data.fotoCopertina : cur.fotoCopertina;
  if (p.data.rimuoviFoto) {
    gallery = gallery.filter((u) => u !== p.data.rimuoviFoto);
    if (copertina === p.data.rimuoviFoto) copertina = gallery[0] ?? null;
    await deletePhoto(p.data.rimuoviFoto);
  }
  // Riordino della galleria: si accettano solo foto già presenti; le mancanti restano in coda.
  if (p.data.ordineFoto) {
    const presenti = new Set(gallery);
    const ordinate = p.data.ordineFoto.filter((u) => presenti.has(u));
    const resto = gallery.filter((u) => !ordinate.includes(u));
    gallery = [...ordinate, ...resto];
  }
  if (copertina && !gallery.includes(copertina)) return fail("Copertina non in galleria", 422);

  const { rimuoviFoto: _r, fotoCopertina: _c, ordineFoto: _o, ...rest } = p.data;

  // Una barca diventa pubblica solo con almeno una foto e un prezzo attivo.
  if (rest.pubblicata === true) {
    if (gallery.length < 1) return fail("Per pubblicare serve almeno una foto", 422);
    const prezzo = await prisma.tariffa.count({ where: { boatId: cur.id, tenantId: t.tenantId, attivo: true } });
    if (prezzo < 1) return fail("Per pubblicare serve un prezzo nel listino", 422);
    // Limiti del piano Free applicati dal server.
    const [tenant, ps] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: t.tenantId }, select: { pianoTipo: true } }),
      prisma.platformSettings.findUnique({ where: { id: "singleton" }, select: { pianoFreeMaxBarche: true, pianoFreeMaxFoto: true } }),
    ]);
    if ((tenant?.pianoTipo ?? "free") === "free") {
      const maxBarche = ps?.pianoFreeMaxBarche ?? 3;
      const altre = await prisma.boat.count({ where: { tenantId: t.tenantId, pubblicata: true, id: { not: cur.id } } });
      if (altre + 1 > maxBarche) return fail(`Piano Free: massimo ${maxBarche} barche pubblicate`, 402);
      const maxFoto = ps?.pianoFreeMaxFoto ?? 5;
      if (gallery.length > maxFoto) return fail(`Piano Free: massimo ${maxFoto} foto per barca`, 402);
    }
  }

  const aggiornata = await prisma.boat.update({ where: { id: cur.id }, data: { ...rest, fotoGallery: gallery, fotoCopertina: copertina } });
  await traccia({
    tenantId: t.tenantId,
    actorId: t.userId,
    azione: "boat.modificata",
    entita: "Boat",
    entitaId: cur.id,
    prima: cur as unknown as Record<string, unknown>,
    dopo: aggiornata as unknown as Record<string, unknown>,
  });
  // I testi della pagina pubblica seguono i dati della barca.
  await rigeneraBarca(cur.id).catch(() => {});
  return ok({ id, fotoCopertina: copertina, fotoGallery: gallery });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const attive = await prisma.booking.count({
    where: { boatId: id, tenantId: t.tenantId, stato: { in: ["prenotata", "in_mare"] } },
  });
  if (attive > 0) return fail("Barca con prenotazioni attive: impossibile eliminare", 409);
  const cur2 = await prisma.boat.findFirst({ where: { id, tenantId: t.tenantId } });
  const d = await prisma.boat.deleteMany({ where: { id, tenantId: t.tenantId } });
  if (!d.count) return fail("Barca non trovata", 404);
  for (const u of cur2?.fotoGallery ?? []) await deletePhoto(u);
  return ok({ ok: true });
}
