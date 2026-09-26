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
  if (copertina && !gallery.includes(copertina)) return fail("Copertina non in galleria", 422);

  const { rimuoviFoto: _r, fotoCopertina: _c, ...rest } = p.data;
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
