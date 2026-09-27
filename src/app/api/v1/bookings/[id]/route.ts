import { fail, ok } from "@/lib/api";
import { traccia } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { parseImportoEuro } from "@/lib/payments";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Transizioni consentite: prenotata -> in_mare -> rientrata ; * -> cancellata (tranne rientrata)
const NEXT: Record<string, string[]> = {
  prenotata: ["in_mare", "cancellata"],
  in_mare: ["rientrata", "cancellata"],
  rientrata: [],
  cancellata: [],
};

// Il canale di vendita (diretto/naboat) NON è modificabile dall'azienda: decide la fee
// NaBoat, quindi lo imposta solo NaBoat (dai metadata della prenotazione/marketplace).
const PatchSchema = z.object({
  stato: z.enum(["prenotata", "in_mare", "rientrata", "cancellata"]).optional(),
  prezzoEuro: z.string().max(20).optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  if (!p.data.stato && p.data.prezzoEuro === undefined) return fail("Nessuna modifica richiesta", 422);

  const cur = await prisma.booking.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!cur) return fail("Prenotazione non trovata", 404);

  if (p.data.stato && !NEXT[cur.stato].includes(p.data.stato)) {
    return fail(`Transizione ${cur.stato} -> ${p.data.stato} non consentita`, 422);
  }

  const data: Record<string, unknown> = {};
  if (p.data.stato) data.stato = p.data.stato;
  if (p.data.prezzoEuro !== undefined) {
    if (p.data.prezzoEuro === null || p.data.prezzoEuro === "") {
      data.prezzoCent = null;
    } else {
      const cent = parseImportoEuro(p.data.prezzoEuro);
      if (cent === null) return fail("Prezzo non valido", 422);
      data.prezzoCent = cent;
    }
  }

  const upd = await prisma.booking.update({ where: { id: cur.id }, data: data as never });
  await traccia({
    tenantId: t.tenantId,
    actorId: t.userId,
    azione: p.data.stato ? `booking.stato.${p.data.stato}` : "booking.modificata",
    entita: "Booking",
    entitaId: cur.id,
    prima: cur as unknown as Record<string, unknown>,
    dopo: upd as unknown as Record<string, unknown>,
  });
  return ok(upd);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const cur = await prisma.booking.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!cur) return fail("Prenotazione non trovata", 404);
  if (cur.stato === "rientrata") return fail("Prenotazione già rientrata", 422);
  const upd = await prisma.booking.update({ where: { id: cur.id }, data: { stato: "cancellata" } });
  await traccia({
    tenantId: t.tenantId,
    actorId: t.userId,
    azione: "booking.cancellata",
    entita: "Booking",
    entitaId: cur.id,
    prima: { stato: cur.stato, clienteNome: cur.clienteNome, startAt: cur.startAt },
    dopo: { stato: upd.stato },
  });
  return ok(upd);
}
