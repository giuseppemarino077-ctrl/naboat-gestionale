import { fail, ok } from "@/lib/api";
import { registraAzione } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { attivitaIncompatibili } from "@/lib/rimozione-barche";
import { requireAzienda } from "@/lib/tenant";

// Richiesta di eliminazione barca: rende subito la barca indisponibile e ne pianifica
// la rimozione operativa differita (2 minuti), senza cancellare lo storico.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const corpo = await req.json().catch(() => ({}));
  const confermaNome = typeof corpo?.confermaNome === "string" ? corpo.confermaNome : "";
  const barca = await prisma.boat.findFirst({ where: { id, tenantId: t.tenantId }, select: { id: true, nome: true } });
  if (!barca) return fail("Barca non trovata", 404);
  if (confermaNome.trim() !== barca.nome) return fail("Il nome digitato non corrisponde al nome della barca", 422);

  const incompatibile = await attivitaIncompatibili(t.tenantId, id);
  if (incompatibile) return fail(incompatibile, 409);

  const adesso = new Date();
  const rimuoviAt = new Date(adesso.getTime() + 2 * 60 * 1000);
  await prisma.boat.update({
    where: { id },
    data: { stato: "non_disponibile", eliminazioneRichiestaAt: adesso, eliminazioneAt: rimuoviAt, pubblicata: false },
  });
  await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: "boat.rimozione_richiesta", entita: "Boat", entitaId: id, nota: `rimozione operativa prevista per ${rimuoviAt.toISOString()}` });
  return ok({ ok: true, eliminazioneAt: rimuoviAt });
}

// Annulla la richiesta di eliminazione (reversibile).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const r = await prisma.boat.updateMany({ where: { id, tenantId: t.tenantId }, data: { eliminazioneRichiestaAt: null, eliminazioneAt: null } });
  if (!r.count) return fail("Barca non trovata", 404);
  await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: "boat.rimozione_annullata", entita: "Boat", entitaId: id });
  return ok({ ok: true });
}
