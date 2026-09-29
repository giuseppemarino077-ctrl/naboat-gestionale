import { fail, ok } from "@/lib/api";
import { traccia, registraAzione } from "@/lib/audit";
import { esitoPatente } from "@/lib/clienti";
import { prisma } from "@/lib/db";
import { bloccaRisorse, validaBarcaNoleggio, verificaDisponibilita } from "@/lib/disponibilita";
import { richiestaEsitoBody } from "@/lib/mailer";
import { accodaEProva } from "@/lib/notifiche";
import { parseImportoEuro, paymentConfig, stripeClient } from "@/lib/payments";
import { transizioneConsentita } from "@/lib/presenze";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Il link monouso di collegamento ospite non esce mai dalle risposte del gestionale.
function senzaLinkOspite<T extends Record<string, any>>(b: T): T {
  const c = { ...b };
  delete c.clienteToken;
  delete c.clienteTokenExpires;
  delete c.clienteTokenUsatoAt;
  return c;
}

// Chi non ha il permesso importi non vede cifre su noleggio, extra e incassi.
function prenotazioneSenzaImporti(b: any) {
  return {
    ...b,
    prezzoCent: null,
    cauzioneCent: null,
    cauzioneIntentId: null,
    danniCent: null,
    // Lo snapshot contiene il prezzo dell'offerta: non deve uscire senza permesso.
    preventivoSnapshot: null,
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

  // Il link monouso di collegamento ospite non esce mai dalle risposte.
  const bPulita = senzaLinkOspite(b);

  // Storico completo con autore (chi ha fatto cosa, quando).
  const righe = await prisma.auditLog.findMany({ where: { entita: "Booking", entitaId: b.id }, orderBy: { createdAt: "desc" }, take: 60 });
  const autori = righe.length
    ? await prisma.user.findMany({ where: { id: { in: [...new Set(righe.map((r) => r.actorId).filter(Boolean) as string[])] } }, select: { id: true, nome: true, email: true } })
    : [];
  const perId = new Map(autori.map((u) => [u.id, u]));
  const storico = righe.map((r) => ({ ...r, autore: r.actorId ? perId.get(r.actorId) ?? null : null }));
  if (t.vedeImporti === false) return ok({ ...prenotazioneSenzaImporti(bPulita), storico });
  return ok({ ...bPulita, storico });
}

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
  // Collegamento a un cliente registrato: se presente, il requisito patente si valuta
  // sulla patente verificata dell'account e l'attestazione manuale non basta.
  clienteAccountId: z.string().uuid().optional().nullable(),
  // Motivo dell'annullamento (facoltativo, registrato nello storico) e versione vista
  // dal client per evitare di sovrascrivere modifiche concorrenti.
  motivo: z.string().max(500).optional().nullable(),
  updatedAt: z.string().datetime().optional(),
});

type Prenotazione = { id: string; stato: string; updatedAt: Date; contrattoFirmatoAt: Date | null; contrattoToken: string | null };

// Comando unico di annullamento: stesso comportamento da PATCH (stato=cancellata) e da
// DELETE. Idempotente (un secondo tentativo non ripete effetti né comunicazioni), con
// controllo di versione, storico sempre scritto e azioni pubbliche future invalidate.
async function annullaPrenotazione(
  t: { tenantId: string; userId: string },
  cur: Prenotazione,
  opts: { motivo?: string | null; updatedAt?: Date | null }
) {
  const esito = await prisma.$transaction(async (tx) => {
    // Stesso lock dei Checkout: l'annullamento si serializza con la creazione di un intento.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${cur.id}`}))`;
    const dentro = await tx.booking.findFirst({ where: { id: cur.id, tenantId: t.tenantId } });
    if (!dentro) return { tipo: "non_trovata" as const };

    // Già annullata: idempotente, nessun nuovo effetto e nessuna nuova comunicazione.
    if (dentro.stato === "cancellata") return { tipo: "gia_annullata" as const, booking: dentro };

    if (opts.updatedAt && dentro.updatedAt.getTime() !== opts.updatedAt.getTime()) return { tipo: "conflitto" as const };
    if (!transizioneConsentita(dentro.stato, "cancellata")) return { tipo: "non_ammessa" as const, stato: dentro.stato };

    // Sessioni di pagamento ancora aperte, lette dopo il lock: verranno spente dopo il salvataggio.
    const aperti = await tx.payment.findMany({
      where: { bookingId: dentro.id, tenantId: t.tenantId, stato: "in_attesa", sessionId: { not: null } },
      select: { sessionId: true },
    });

    const upd = await tx.booking.update({
      where: { id: dentro.id },
      data: {
        stato: "cancellata",
        // Le azioni pubbliche future non sono più raggiungibili dal token.
        payToken: null,
        payTokenExpires: null,
        // Un contratto non firmato non è più firmabile; se firmato resta consultabile.
        contrattoToken: dentro.contrattoFirmatoAt ? dentro.contrattoToken : null,
      },
    });
    // Checkout aperti: l'intento locale non è più incassabile (l'annullo su Stripe è best effort).
    await tx.payment.updateMany({
      where: { bookingId: dentro.id, tenantId: t.tenantId, stato: "in_attesa" },
      data: { stato: "fallito" },
    });
    // Un solo evento di storico sempre attivo, con autore e motivo.
    await tx.auditLog.create({
      data: {
        tenantId: t.tenantId,
        actorId: t.userId,
        azione: "booking.cancellata",
        entita: "Booking",
        entitaId: dentro.id,
        dettagli: JSON.stringify({ nota: `${dentro.stato} → cancellata${opts.motivo ? ` · ${opts.motivo}` : ""}` }),
      },
    });
    return { tipo: "annullata" as const, booking: upd, statoPrima: dentro.stato, aperti };
  });

  if (esito.tipo === "non_trovata") return fail("Prenotazione non trovata", 404);
  if (esito.tipo === "conflitto") return fail("La prenotazione è stata modificata nel frattempo: ricarica e riprova", 409);
  if (esito.tipo === "non_ammessa") return fail(`Prenotazione ${esito.stato}: non è possibile annullarla`, 422);
  if (esito.tipo === "gia_annullata") return ok(senzaLinkOspite(esito.booking));

  // Chiusura best effort delle sessioni Stripe ancora aperte: una chiave non valida
  // non deve far fallire l'annullamento.
  if (esito.aperti.length) {
    try {
      const cfg = await paymentConfig(t.tenantId);
      if (cfg?.stripeSecretKey) {
        const stripe = stripeClient(cfg.stripeSecretKey);
        for (const p of esito.aperti) {
          if (!p.sessionId) continue;
          try {
            const s = await stripe.checkout.sessions.retrieve(p.sessionId);
            if (s.status === "open") await stripe.checkout.sessions.expire(s.id);
          } catch { /* la sessione scadrà da sola */ }
        }
      }
    } catch { /* l'annullamento resta valido anche se Stripe non risponde */ }
  }

  // Notifica al cliente una sola volta: solo per le richieste dal sito (da_confermare -> cancellata).
  if (esito.statoPrima === "da_confermare") {
    try {
      const full = await prisma.booking.findUnique({
        where: { id: cur.id },
        include: { boat: { select: { nome: true } }, tenant: { select: { nome: true, telefonoContatto: true } }, customer: { select: { email: true } } },
      });
      const emailCliente = full?.email ?? full?.customer?.email;
      if (full && emailCliente) {
        const corpo = richiestaEsitoBody({
          cliente: full.clienteNome ?? "cliente",
          barca: full.boat.nome,
          azienda: full.tenant.nome,
          quando: full.startAt.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" }),
          confermata: false,
          telefono: full.tenant.telefonoContatto,
        });
        // Outbox: una sola notifica per evento; la consegna è best effort.
        await accodaEProva({
          tenantId: t.tenantId,
          evento: "richiesta.esito",
          destinatario: emailCliente,
          oggetto: corpo.subject,
          testo: corpo.text,
          html: corpo.html,
          dedupKey: `richiesta.esito:${cur.id}:cancellata`,
        });
      }
    } catch { /* l'email non deve bloccare l'operazione */ }
  }

  return ok(senzaLinkOspite(esito.booking));
}

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

  const updatedAtAtteso = p.data.updatedAt ? new Date(p.data.updatedAt) : null;

  // L'annullamento è un comando a sé: non si combina con altre modifiche.
  if (p.data.stato === "cancellata") {
    const altriCampi = [
      p.data.prezzoEuro, p.data.boatId, p.data.startAt, p.data.endAt, p.data.clienteNome, p.data.telefono,
      p.data.passeggeri, p.data.destinazione, p.data.formula, p.data.note, p.data.patenteOk, p.data.skipperId, p.data.clienteAccountId,
    ].some((v) => v !== undefined);
    if (altriCampi) return fail("L'annullamento non si combina con altre modifiche", 422);
    return annullaPrenotazione(t, cur, { motivo: p.data.motivo ?? null, updatedAt: updatedAtAtteso });
  }

  if (p.data.stato && !transizioneConsentita(cur.stato, p.data.stato)) {
    return fail(`Transizione ${cur.stato} -> ${p.data.stato} non consentita`, 422);
  }
  // Concorrenza ottimistica: se il client indica la versione vista, deve combaciare.
  if (updatedAtAtteso && updatedAtAtteso.getTime() !== cur.updatedAt.getTime()) {
    return fail("La prenotazione è stata modificata nel frattempo: ricarica e riprova", 409);
  }

  const data: Record<string, unknown> = {};
  if (p.data.stato) data.stato = p.data.stato;

  if (p.data.prezzoEuro !== undefined) {
    if (p.data.prezzoEuro === null || p.data.prezzoEuro === "") data.prezzoCent = null;
    else {
      const cent = parseImportoEuro(p.data.prezzoEuro);
      if (cent === null) return fail("Prezzo non valido", 422);
      data.prezzoCent = cent;
      data.prezzoDaDefinire = false; // il prezzo è stato determinato
    }
  }

  if (p.data.clienteNome !== undefined) data.clienteNome = p.data.clienteNome;
  if (p.data.telefono !== undefined) data.telefono = p.data.telefono;
  if (p.data.destinazione !== undefined) data.destinazione = p.data.destinazione;
  if (p.data.formula !== undefined) data.formula = p.data.formula;
  if (p.data.note !== undefined) data.note = p.data.note;
  if (p.data.patenteOk !== undefined) data.patenteOk = p.data.patenteOk;
  if (p.data.skipperId !== undefined) data.skipperId = p.data.skipperId;
  if (p.data.clienteAccountId !== undefined) data.clienteAccountId = p.data.clienteAccountId;

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

  // M03: la conferma di una richiesta (da_confermare -> prenotata) richiede un prezzo
  // determinato. Se manca si legge lo snapshot congelato alla richiesta: la tariffa
  // NON si ricalcola dal listino attuale (una variazione non riscrive l'offerta).
  if (p.data.stato === "prenotata" && cur.stato === "da_confermare") {
    if (data.prezzoCent === null) delete data.prezzoCent; // non si conferma azzerando il prezzo
    if (data.prezzoCent === undefined && (cur.prezzoCent == null || cur.prezzoCent <= 0)) {
      const snap = cur.preventivoSnapshot as { prezzoNoleggioCent?: number | null } | null;
      const prezzoSnapshot = snap?.prezzoNoleggioCent ?? null;
      if (prezzoSnapshot != null && prezzoSnapshot > 0) {
        data.prezzoCent = prezzoSnapshot;
        data.prezzoDaDefinire = false;
      } else {
        return fail("Prezzo da definire: indica il prezzo del noleggio prima di confermare la richiesta", 422);
      }
    }
  }

  // Stato finale (record corrente fuso con le modifiche): è questo che va validato, non
  // il solo insieme dei campi inviati. Cambiare solo i passeggeri, ad esempio, deve
  // comunque rispettare capienza e disponibilità.
  const nuovoBoatId = p.data.boatId ?? cur.boatId;
  const nuovoStart = p.data.startAt ? new Date(p.data.startAt) : cur.startAt;
  const nuovoEnd = p.data.endAt ? new Date(p.data.endAt) : cur.endAt;
  const finalePasseggeri = p.data.passeggeri ?? cur.passeggeri;
  const finalePatenteOk = p.data.patenteOk ?? cur.patenteOk;
  const finaleSkipperId = p.data.skipperId !== undefined ? p.data.skipperId : cur.skipperId;
  const finaleClienteAccountId = p.data.clienteAccountId !== undefined ? p.data.clienteAccountId : cur.clienteAccountId;
  // Confermare o far partire una prenotazione rivaluta sempre il requisito patente
  // (una richiesta dal sito arriva senza attestazione manuale).
  const statoRichiedePatente = p.data.stato === "prenotata" || p.data.stato === "in_mare";
  const cambiaOperativo =
    p.data.boatId !== undefined ||
    p.data.startAt !== undefined ||
    p.data.endAt !== undefined ||
    p.data.passeggeri !== undefined ||
    p.data.skipperId !== undefined ||
    p.data.patenteOk !== undefined ||
    p.data.clienteAccountId !== undefined ||
    statoRichiedePatente;

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
        // Requisito patente: cliente registrato -> patente verificata e non scaduta;
        // ospite -> attestazione manuale patenteOk.
        if (finaleClienteAccountId) {
          const account = await tx.clienteAccount.findUnique({ where: { id: finaleClienteAccountId }, select: { id: true } });
          if (!account) return { err: "Cliente registrato non trovato", status: 422 };
        }
        const patente = finaleClienteAccountId
          ? await tx.patenteNautica.findUnique({ where: { accountId: finaleClienteAccountId }, select: { stato: true, scadenzaAt: true } })
          : null;
        const errPatente = esitoPatente(boat, { patenteOk: finalePatenteOk, skipperId: finaleSkipperId, clienteAccountId: finaleClienteAccountId, patente });
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
    if (cur.stato === "da_confermare" && p.data.stato === "prenotata") {
      try {
        const full = await prisma.booking.findUnique({
          where: { id: cur.id },
          include: { boat: { select: { nome: true } }, tenant: { select: { nome: true, telefonoContatto: true } }, customer: { select: { email: true } } },
        });
        const emailCliente = full?.email ?? full?.customer?.email;
        if (full && emailCliente) {
          const corpo = richiestaEsitoBody({
            cliente: full.clienteNome ?? "cliente",
            barca: full.boat.nome,
            azienda: full.tenant.nome,
            quando: full.startAt.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" }),
            confermata: true,
            telefono: full.tenant.telefonoContatto,
          });
          await accodaEProva({
            tenantId: t.tenantId,
            evento: "richiesta.esito",
            destinatario: emailCliente,
            oggetto: corpo.subject,
            testo: corpo.text,
            html: corpo.html,
            dedupKey: `richiesta.esito:${cur.id}:confermata`,
          });
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
  return ok(senzaLinkOspite(upd));
}

// DELETE non cancella il record: si comporta come l'annullamento (soft), così incassi,
// documenti e storico restano. Stesso comando del PATCH stato=cancellata.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const cur = await prisma.booking.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!cur) return fail("Prenotazione non trovata", 404);

  const raw = new URL(req.url).searchParams.get("updatedAt");
  const updatedAt = raw ? new Date(raw) : null;
  if (updatedAt && Number.isNaN(updatedAt.getTime())) return fail("updatedAt non valido", 422);

  return annullaPrenotazione(t, cur, { updatedAt });
}
