import { fail, ok } from "@/lib/api";
import { traccia } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { parseImportoEuro } from "@/lib/payments";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Dettaglio di una prenotazione: barca, cliente, skipper, extra e incassi.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const b = await prisma.booking.findFirst({
    where: { id, tenantId: t.tenantId },
    include: {
      boat: { select: { id: true, nome: true, tipo: true, capienza: true, patenteRichiesta: true, fotoCopertina: true } },
      skipper: { select: { id: true, nome: true, telefono: true } },
      customer: { select: { id: true, nome: true, telefono: true, email: true } },
      extras: { include: { extra: { select: { id: true, nome: true, prezzo: true } } } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!b) return fail("Prenotazione non trovata", 404);
  return ok(b);
}

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
  // Riprogrammazione e modifica dati (usate dal calendario)
  boatId: z.string().uuid().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  clienteNome: z.string().min(1).max(120).optional(),
  telefono: z.string().min(4).max(40).optional(),
  passeggeri: z.number().int().min(1).max(60).optional(),
  destinazione: z.string().max(120).optional().nullable(),
  formula: z.string().max(120).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  patenteOk: z.boolean().optional(),
  skipperId: z.string().uuid().optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);

  const cur = await prisma.booking.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!cur) return fail("Prenotazione non trovata", 404);

  if (p.data.stato && !NEXT[cur.stato].includes(p.data.stato)) {
    return fail(`Transizione ${cur.stato} -> ${p.data.stato} non consentita`, 422);
  }

  const data: Record<string, unknown> = {};
  if (p.data.stato) data.stato = p.data.stato;

  if (p.data.prezzoEuro !== undefined) {
    if (p.data.prezzoEuro === null || p.data.prezzoEuro === "") data.prezzoCent = null;
    else {
      const cent = parseImportoEuro(p.data.prezzoEuro);
      if (cent === null) return fail("Prezzo non valido", 422);
      data.prezzoCent = cent;
    }
  }

  if (p.data.clienteNome !== undefined) data.clienteNome = p.data.clienteNome;
  if (p.data.telefono !== undefined) data.telefono = p.data.telefono;
  if (p.data.destinazione !== undefined) data.destinazione = p.data.destinazione;
  if (p.data.formula !== undefined) data.formula = p.data.formula;
  if (p.data.note !== undefined) data.note = p.data.note;
  if (p.data.patenteOk !== undefined) data.patenteOk = p.data.patenteOk;
  if (p.data.skipperId !== undefined) data.skipperId = p.data.skipperId;

  // Spostamento (barca / giorno / orario): si ricontrollano disponibilità e capienza.
  if (p.data.boatId || p.data.startAt || p.data.endAt) {
    const nuovoBoatId = p.data.boatId ?? cur.boatId;
    const nuovoStart = p.data.startAt ? new Date(p.data.startAt) : cur.startAt;
    const nuovoEnd = p.data.endAt ? new Date(p.data.endAt) : cur.endAt;
    if (!(nuovoStart < nuovoEnd)) return fail("Orari incoerenti", 422);
    const boat = await prisma.boat.findFirst({ where: { id: nuovoBoatId, tenantId: t.tenantId } });
    if (!boat) return fail("Barca non trovata", 404);
    const pass = p.data.passeggeri ?? cur.passeggeri;
    if (pass > boat.capienza) return fail(`Capienza max ${boat.capienza}`, 422);
    const overlap = await prisma.booking.findFirst({
      where: { tenantId: t.tenantId, boatId: nuovoBoatId, id: { not: id }, stato: { in: ["prenotata", "in_mare"] }, startAt: { lt: nuovoEnd }, endAt: { gt: nuovoStart } },
      select: { id: true },
    });
    if (overlap) return fail("Sovrapposizione con altra prenotazione", 409);
    const block = await prisma.block.findFirst({ where: { tenantId: t.tenantId, boatId: nuovoBoatId, startAt: { lt: nuovoEnd }, endAt: { gt: nuovoStart } }, select: { id: true } });
    if (block) return fail("Risorsa bloccata in quel periodo", 409);
    data.boatId = nuovoBoatId;
    data.startAt = nuovoStart;
    data.endAt = nuovoEnd;
  }

  if (p.data.passeggeri !== undefined) data.passeggeri = p.data.passeggeri;

  if (Object.keys(data).length === 0) return fail("Nessuna modifica richiesta", 422);

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
