import { fail, ok } from "@/lib/api";
import { traccia, registraAzione } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { bloccaRisorse, validaBarcaNoleggio, validaPatente, verificaDisponibilita } from "@/lib/disponibilita";
import { richiestaEsitoBody, sendMail } from "@/lib/mailer";
import { parseImportoEuro } from "@/lib/payments";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Chi non ha il permesso importi non vede cifre su noleggio, extra e incassi.
function prenotazioneSenzaImporti(b: any) {
  return {
    ...b,
    prezzoCent: null,
    cauzioneCent: null,
    cauzioneIntentId: null,
    danniCent: null,
    extras: Array.isArray(b.extras)
      ? b.extras.map((e: any) => ({ ...e, extra: e.extra ? { ...e.extra, prezzo: null } : e.extra }))
      : b.extras,
    payments: Array.isArray(b.payments)
      ? b.payments.map((p: any) => ({ ...p, importoCent: null, totaleCent: null, feeNaboatCent: null, feeProviderCent: null, rimborsoCent: null }))
      : b.payments,
  };
}

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

  // Storico completo con autore (chi ha fatto cosa, quando).
  const righe = await prisma.auditLog.findMany({ where: { entita: "Booking", entitaId: b.id }, orderBy: { createdAt: "desc" }, take: 60 });
  const autori = righe.length
    ? await prisma.user.findMany({ where: { id: { in: [...new Set(righe.map((r) => r.actorId).filter(Boolean) as string[])] } }, select: { id: true, nome: true, email: true } })
    : [];
  const perId = new Map(autori.map((u) => [u.id, u]));
  const storico = righe.map((r) => ({ ...r, autore: r.actorId ? perId.get(r.actorId) ?? null : null }));
  if (t.vedeImporti === false) return ok({ ...prenotazioneSenzaImporti(b), storico });
  return ok({ ...b, storico });
}

// Transizioni consentite: da_confermare -> prenotata (conferma) | cancellata ;
// prenotata -> in_mare | no_show | cancellata ; in_mare -> rientrata | cancellata.
const NEXT: Record<string, string[]> = {
  da_confermare: ["prenotata", "cancellata"],
  prenotata: ["in_mare", "no_show", "cancellata"],
  in_mare: ["rientrata", "cancellata"],
  rientrata: [],
  no_show: [],
  cancellata: [],
};

// Il canale di vendita (diretto/naboat) NON è modificabile dall'azienda: decide la fee
// NaBoat, quindi lo imposta solo NaBoat (dai metadata della prenotazione/marketplace).
const PatchSchema = z.object({
  stato: z.enum(["da_confermare", "prenotata", "in_mare", "rientrata", "no_show", "cancellata"]).optional(),
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

  // Modificare il prezzo è un'operazione economica: serve il permesso importi.
  if (t.vedeImporti === false && p.data.prezzoEuro !== undefined) return fail("Permesso negato: non hai l'accesso agli importi", 403);

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

  // Spostamento (barca / giorno / orario): si impostano i nuovi valori.
  if (p.data.boatId !== undefined || p.data.startAt !== undefined || p.data.endAt !== undefined) {
    const nuovoBoatId = p.data.boatId ?? cur.boatId;
    const nuovoStart = p.data.startAt ? new Date(p.data.startAt) : cur.startAt;
    const nuovoEnd = p.data.endAt ? new Date(p.data.endAt) : cur.endAt;
    if (!(nuovoStart < nuovoEnd)) return fail("Orari incoherenti", 422);
    data.boatId = nuovoBoatId;
    data.startAt = nuovoStart;
    data.endAt = nuovoEnd;
  }

  if (p.data.passeggeri !== undefined) data.passeggeri = p.data.passeggeri;

  if (Object.keys(data).length === 0) return fail("Nessuna modifica richiesta", 422);

  // Stato finale (record corrente fuso con le modifiche): è questo che va validato, non
  // il solo insieme dei campi inviati. Cambiare solo i passeggeri, ad esempio, deve
  // comunque rispettare capienza e disponibilità.
  const nuovoBoatId = p.data.boatId ?? cur.boatId;
  const nuovoStart = p.data.startAt ? new Date(p.data.startAt) : cur.startAt;
  const nuovoEnd = p.data.endAt ? new Date(p.data.endAt) : cur.endAt;
  const finalePasseggeri = p.data.passeggeri ?? cur.passeggeri;
  const finalePatenteOk = p.data.patenteOk ?? cur.patenteOk;
  const finaleSkipperId = p.data.skipperId !== undefined ? p.data.skipperId : cur.skipperId;
  const cambiaOperativo =
    p.data.boatId !== undefined ||
    p.data.startAt !== undefined ||
    p.data.endAt !== undefined ||
    p.data.passeggeri !== undefined ||
    p.data.skipperId !== undefined ||
    p.data.patenteOk !== undefined;

  let upd: any;
  if (cambiaOperativo) {
    // Lock su vecchia e nuova barca (in ordine stabile) e sullo skipper finale:
    // lo spostamento non può sfuggire a due addetti che salvano insieme.
    let esito: { err?: string; status?: number; booking?: any };
    try {
      esito = await prisma.$transaction(async (tx) => {
        await bloccaRisorse(tx, { boatIds: [cur.boatId, nuovoBoatId], skipperId: finaleSkipperId });

        const boat = await tx.boat.findFirst({ where: { id: nuovoBoatId, tenantId: t.tenantId } });
        if (!boat) return { err: "Barca non trovata", status: 404 };
        const errBarca = validaBarcaNoleggio(boat, finalePasseggeri);
        if (errBarca) return { err: errBarca, status: 422 };
        const errPatente = validaPatente(boat, { patenteOk: finalePatenteOk, skipperId: finaleSkipperId });
        if (errPatente) return { err: errPatente, status: 422 };

        if (finaleSkipperId) {
          const sk = await tx.skipper.findFirst({ where: { id: finaleSkipperId, tenantId: t.tenantId, attivo: true }, select: { id: true } });
          if (!sk) return { err: "Skipper non valido", status: 422 };
        }

        const disp = await verificaDisponibilita(tx, {
          tenantId: t.tenantId,
          boatId: nuovoBoatId,
          startAt: nuovoStart,
          endAt: nuovoEnd,
          bookingId: cur.id,
          skipperId: finaleSkipperId,
        });
        if (!disp.ok) return { err: disp.messaggio, status: 409 };

        const booking = await tx.booking.update({ where: { id: cur.id }, data: data as never });
        return { booking };
      });
    } catch (e) {
      if (/Sovrapposizione/i.test(e instanceof Error ? e.message : String(e))) return fail("Sovrapposizione con altra prenotazione", 409);
      throw e;
    }
    if (esito.err) return fail(esito.err, esito.status ?? 422);
    upd = esito.booking;
  } else {
    upd = await prisma.booking.update({ where: { id: cur.id }, data: data as never });
  }

  if (p.data.stato) {
    await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: `booking.stato.${p.data.stato}`, entita: "Booking", entitaId: cur.id, nota: `${cur.stato} → ${p.data.stato}` });
    // Esito di una richiesta dal sito: si avvisa il cliente.
    if (cur.stato === "da_confermare" && (p.data.stato === "prenotata" || p.data.stato === "cancellata")) {
      try {
        const full = await prisma.booking.findUnique({
          where: { id: cur.id },
          include: { boat: { select: { nome: true } }, tenant: { select: { nome: true, telefonoContatto: true } }, customer: { select: { email: true } } },
        });
        if (full?.customer?.email) {
          const corpo = richiestaEsitoBody({
            cliente: full.clienteNome ?? "cliente",
            barca: full.boat.nome,
            azienda: full.tenant.nome,
            quando: full.startAt.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" }),
            confermata: p.data.stato === "prenotata",
            telefono: full.tenant.telefonoContatto,
          });
          await sendMail(full.customer.email, corpo.subject, corpo.text, corpo.html);
        }
      } catch { /* l'email non deve bloccare l'operazione */ }
    }
  }
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
