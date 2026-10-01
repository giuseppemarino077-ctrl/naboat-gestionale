import { fail, ok } from "@/lib/api";
import { registraAzione } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { esitoPatente } from "@/lib/clienti";
import { bloccaRisorse, validaBarcaNoleggio, verificaDisponibilita } from "@/lib/disponibilita";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

const Schema = z.object({
  boatId: z.string().uuid(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  passeggeri: z.number().int().min(1).max(60).optional(),
  offertaId: z.string().uuid().optional().nullable(),
  portoId: z.string().uuid().optional().nullable(),
  skipperId: z.string().uuid().optional().nullable(),
  motivo: z.string().trim().min(3).max(1000),
  updatedAt: z.string().datetime().optional(),
});

// Riprogrammazione (semantica BOATLY): annullamento dell'originale e creazione di
// una nuova prenotazione collegata, in un'unica transazione. Ammessa solo sui casi
// non finanziati/firmati: l'originale resta intatta se una verifica fallisce.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);

  const cur = await prisma.booking.findFirst({ where: { id, tenantId: t.tenantId }, include: { extras: true } });
  if (!cur) return fail("Prenotazione non trovata", 404);

  // Vincoli di ammissibilità: solo prenotazioni dirette confermate, senza incassi,
  // contratti firmati o canale marketplace.
  if (cur.stato !== "prenotata") return fail("Solo una prenotazione confermata può essere riprogrammata", 422);
  if (cur.origineCanale !== "diretto") return fail("Questa prenotazione ha un flusso marketplace: usa il percorso di cancellazione con pagamento", 409);
  if (cur.contrattoFirmatoAt) return fail("La prenotazione ha un contratto firmato: non può essere sostituita", 409);
  const pagamenti = await prisma.payment.count({ where: { bookingId: cur.id, tenantId: t.tenantId, stato: { in: ["pagato", "in_attesa"] } } });
  if (pagamenti > 0) return fail("La prenotazione ha movimenti finanziari: gestisci prima l'incasso", 409);
  if (p.data.updatedAt && new Date(p.data.updatedAt).getTime() !== cur.updatedAt.getTime()) {
    return fail("La prenotazione è stata modificata nel frattempo: ricarica e riprova", 409);
  }

  const start = new Date(p.data.startAt);
  const end = new Date(p.data.endAt);
  if (!(start < end)) return fail("Orari incoerenti", 422);
  const passeggeri = p.data.passeggeri ?? cur.passeggeri;

  const esito = await prisma.$transaction(async (tx) => {
    await bloccaRisorse(tx, { boatIds: [cur.boatId, p.data.boatId], skipperId: p.data.skipperId ?? null });

    const dentro = await tx.booking.findFirst({ where: { id: cur.id, tenantId: t.tenantId }, include: { extras: true } });
    if (!dentro) return { err: "Prenotazione non trovata", status: 404 };
    if (dentro.stato !== "prenotata") return { err: "La prenotazione non è più confermata", status: 409 };
    if (p.data.updatedAt && dentro.updatedAt.getTime() !== new Date(p.data.updatedAt).getTime()) {
      return { err: "La prenotazione è stata modificata nel frattempo: ricarica e riprova", status: 409 };
    }

    const boat = await tx.boat.findFirst({ where: { id: p.data.boatId, tenantId: t.tenantId } });
    if (!boat) return { err: "Barca non trovata", status: 404 };
    const errBarca = validaBarcaNoleggio(boat, passeggeri);
    if (errBarca) return { err: errBarca, status: 422 };

    if (p.data.offertaId) {
      const off = await tx.boatOfferta.findFirst({ where: { id: p.data.offertaId, tenantId: t.tenantId, boatId: p.data.boatId, attiva: true }, select: { id: true } });
      if (!off) return { err: "Modalità non valida per questa barca", status: 422 };
    }
    if (p.data.portoId) {
      const po = await tx.porto.findFirst({ where: { id: p.data.portoId, tenantId: t.tenantId }, select: { id: true } });
      if (!po) return { err: "Sede non valida per questa azienda", status: 422 };
    }
    if (p.data.skipperId) {
      const sk = await tx.skipper.findFirst({ where: { id: p.data.skipperId, tenantId: t.tenantId, attivo: true }, select: { id: true } });
      if (!sk) return { err: "Skipper non valido", status: 422 };
    }

    // La dichiarazione patente è già nota: si conserva, ma va rivalidata sulla nuova barca.
    const errPatente = esitoPatente(boat, { patenteOk: dentro.patenteOk, skipperId: p.data.skipperId ?? null, clienteAccountId: dentro.clienteAccountId, patente: null });
    if (errPatente) return { err: errPatente, status: 422 };

    const disp = await verificaDisponibilita(tx, {
      tenantId: t.tenantId, boatId: p.data.boatId, startAt: start, endAt: end, bookingId: dentro.id, skipperId: p.data.skipperId ?? null,
    });
    if (!disp.ok) return { err: disp.messaggio, status: 409 };

    // 1) Annulla l'originale (logico) e invalida i link non firmati.
    await tx.booking.update({
      where: { id: dentro.id },
      data: {
        stato: "cancellata",
        payToken: null,
        payTokenExpires: null,
        contrattoToken: dentro.contrattoFirmatoAt ? dentro.contrattoToken : null,
      },
    });
    await tx.payment.updateMany({ where: { bookingId: dentro.id, tenantId: t.tenantId, stato: "in_attesa" }, data: { stato: "fallito" } });

    // 2) Crea la sostituta collegata, conservando cliente, prezzo e configurazione ammessa.
    const nuova = await tx.booking.create({
      data: {
        tenantId: t.tenantId,
        boatId: p.data.boatId,
        customerId: dentro.customerId,
        clienteNome: dentro.clienteNome,
        telefono: dentro.telefono,
        email: dentro.email,
        startAt: start,
        endAt: end,
        passeggeri,
        stato: "prenotata",
        destinazione: dentro.destinazione,
        formula: dentro.formula,
        note: dentro.note,
        patenteRisposta: dentro.patenteRisposta,
        patenteOk: dentro.patenteOk,
        skipperStato: p.data.skipperId ? "ASSIGNED" : dentro.skipperStato,
        skipperId: p.data.skipperId ?? null,
        skipperNote: dentro.skipperNote,
        offertaId: p.data.offertaId ?? dentro.offertaId,
        portoId: p.data.portoId ?? dentro.portoId,
        origineCanale: "diretto",
        prezzoCent: dentro.prezzoCent,
        prezzoDaDefinire: dentro.prezzoDaDefinire,
        cauzioneCent: dentro.cauzioneCent,
        cauzioneStato: dentro.cauzioneStato,
        clienteAccountId: dentro.clienteAccountId,
        sostituisceId: dentro.id,
        motivoRiprogrammazione: p.data.motivo,
        extras: { create: dentro.extras.map((e) => ({ extraId: e.extraId, quantita: e.quantita })) },
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: t.tenantId, actorId: t.userId, azione: "booking.riprogrammata", entita: "Booking", entitaId: nuova.id,
        dettagli: JSON.stringify({ originale: dentro.id, motivo: p.data.motivo, da: dentro.startAt.toISOString(), a: start.toISOString() }),
      },
    });
    return { nuova };
  });

  if ("err" in esito && esito.err) return fail(esito.err, esito.status ?? 422);
  await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: "booking.riprogrammata", entita: "Booking", entitaId: (esito as { nuova: { id: string } }).nuova.id, nota: p.data.motivo });
  return ok((esito as { nuova: unknown }).nuova, 201);
}
