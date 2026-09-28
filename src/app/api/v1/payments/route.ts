import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  allineaRimborsi,
  calcolaRimborsabile,
  calcolaRimborso,
  feeNaBoatApplicabile,
  formattaEuro,
  parseImportoEuro,
  paymentConfig,
  snapshotCondizioni,
  statoRimborsoDaStripe,
  stripeClient,
  rimborsoAmmesso,
  type RefundStato,
} from "@/lib/payments";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Registro incassi dell'azienda.
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  if (t.vedeImporti === false) return fail("Permesso negato: non hai l'accesso agli importi", 403);
  const q = new URL(req.url).searchParams;
  const where: Record<string, unknown> = { tenantId: t.tenantId };
  if (q.get("bookingId")) where.bookingId = q.get("bookingId");
  if (q.get("stato")) where.stato = q.get("stato");
  const list = await prisma.payment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { booking: { select: { id: true, startAt: true, clienteNome: true, boat: { select: { nome: true } } } } },
  });
  return ok(list);
}

const ManualeSchema = z.object({
  bookingId: z.string().uuid().optional(),
  importoEuro: z.string().min(1).max(20),
  metodo: z.enum(["contanti", "pos", "bonifico", "altro"]),
  tipo: z.enum(["acconto", "saldo", "totale"]).default("totale"),
  descrizione: z.string().max(300).optional(),
});

// Incasso registrato a mano dall'operatore (RFQ D3: link online + registrazione in banchina).
export async function POST(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  if (t.vedeImporti === false) return fail("Permesso negato: non hai l'accesso agli importi", 403);
  const p = ManualeSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati incasso non validi", 422);
  const v = p.data;

  const cfg = await paymentConfig(t.tenantId);

  const importoCent = parseImportoEuro(v.importoEuro);
  if (importoCent === null) return fail("Importo non valido", 422);

  let origineCanale = "diretto";
  if (v.bookingId) {
    const b = await prisma.booking.findFirst({
      where: { id: v.bookingId, tenantId: t.tenantId },
      select: { id: true, origineCanale: true },
    });
    if (!b) return fail("Prenotazione non trovata", 404);
    origineCanale = b.origineCanale;
  }

  // L'origine si legge dalla prenotazione: un incasso su canale diretto non genera fee NaBoat.
  const feeNaboatCent = feeNaBoatApplicabile(origineCanale, cfg)
    ? Math.round((importoCent * (cfg?.feeNaboatPct ?? 0)) / 100)
    : 0;
  const payment = await prisma.payment.create({
    data: {
      tenantId: t.tenantId,
      bookingId: v.bookingId,
      provider: "manuale",
      tipo: v.tipo,
      importoCent,
      feeNaboatCent,
      feeProviderCent: 0,
      totaleCent: importoCent + feeNaboatCent,
      stato: "pagato",
      metodo: v.metodo,
      descrizione: v.descrizione,
      paidAt: new Date(),
      origineCanale,
      condizioniSnapshot: snapshotCondizioni(cfg, origineCanale),
    },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: t.tenantId,
      actorId: t.userId,
      azione: "pagamento.manuale",
      entita: "Payment",
      entitaId: payment.id,
    },
  });
  return ok(payment, 201);
}

const RimborsoSchema = z.object({
  azione: z.literal("rimborso"),
  importoEuro: z.string().max(20).optional(),
  completo: z.boolean().default(false),
  idempotencyKey: z.string().min(8).max(120).optional(),
  motivo: z.string().max(300).optional(),
});

// Rimborso (RFQ D8): ammesso solo fino a N ore prima dell'uscita, parziale per regola.
// Riguarda SOLO il capitale del noleggio: fee NaBoat e commissione fornitore restano incassate.
export async function PATCH(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  if (t.vedeImporti === false) return fail("Permesso negato: non hai l'accesso agli importi", 403);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("Parametro id obbligatorio", 422);
  const p = RimborsoSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Richiesta non valida", 422);

  const pay = await prisma.payment.findFirst({
    where: { id, tenantId: t.tenantId },
    include: { booking: { select: { startAt: true } } },
  });
  if (!pay) return fail("Incasso non trovato", 404);

  // Replay idempotente: la stessa chiave non genera un secondo rimborso.
  const idemKey = p.data.idempotencyKey ?? null;
  if (idemKey) {
    const esistente = await prisma.refund.findFirst({ where: { idempotencyKey: idemKey, tenantId: t.tenantId } });
    if (esistente) {
      if (esistente.paymentId !== pay.id) return fail("Chiave di idempotenza già usata su un altro incasso", 409);
      return ok({
        id: pay.id,
        stato: pay.stato,
        rimborsoCent: pay.rimborsoCent,
        refundId: esistente.refundId,
        refundStato: esistente.stato,
        riutilizzato: true,
      });
    }
  }

  if (pay.stato !== "pagato" && pay.stato !== "rimborsato_parziale") return fail("Incasso non rimborsabile", 422);

  const cfg = await paymentConfig(t.tenantId);
  const oreMinime = cfg?.rimborsoOreMinime ?? 24;
  const startAt = pay.booking?.startAt;
  if (startAt && !rimborsoAmmesso(startAt, oreMinime)) {
    return fail(`Rimborso non ammesso: consentito solo fino a ${oreMinime} ore prima dell'uscita`, 422);
  }

  // Importo richiesto. Se è una richiesta esplicita dell'operatore, superare il
  // tetto è un errore 422 (non un taglio silenzioso).
  let richiesto: number;
  let esplicito = false;
  if (p.data.completo) {
    richiesto = pay.importoCent;
  } else if (p.data.importoEuro) {
    const parsed = parseImportoEuro(p.data.importoEuro);
    if (parsed === null) return fail("Importo rimborso non valido", 422);
    richiesto = parsed;
    esplicito = true;
  } else {
    richiesto = calcolaRimborso(pay.importoCent, cfg?.rimborsoPct ?? 100);
  }

  // Prenotazione sotto lock per incasso: due richieste simultanee non superano il
  // tetto, perché la seconda vede la prenotazione (richiesto/pendente) della prima.
  const prenot = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rimborso:${pay.id}`}))`;
    const rimborsi = await tx.refund.findMany({ where: { paymentId: pay.id }, select: { importoCent: true, stato: true } });
    const disponibile = calcolaRimborsabile(pay, rimborsi).disponibileCent;
    if (disponibile <= 0) return { esito: "zero" as const };
    if (esplicito && richiesto > disponibile) return { esito: "tetto" as const, disponibile };
    const importo = Math.min(richiesto, disponibile);
    if (importo <= 0) return { esito: "zero" as const };
    const refund = await tx.refund.create({
      data: {
        tenantId: pay.tenantId,
        paymentId: pay.id,
        importoCent: importo,
        stato: "richiesto",
        provider: pay.provider === "stripe" ? "stripe" : "manuale",
        idempotencyKey: idemKey,
        motivo: p.data.motivo,
        richiestoDa: t.userId,
      },
    });
    return { esito: "ok" as const, refund, importo };
  });

  if (prenot.esito === "tetto") return fail(`Importo oltre il tetto rimborsabile (${formattaEuro(prenot.disponibile)})`, 422);
  if (prenot.esito === "zero") return fail("Nessun importo rimborsabile con la regola attuale", 422);

  const refundRow = prenot.refund;
  let refundId: string | null = null;
  let statoRimborso: RefundStato = "riuscito";
  let motivoFallimento: string | null = null;

  if (pay.provider === "stripe") {
    if (!cfg?.stripeSecretKey) {
      await prisma.refund.update({ where: { id: refundRow.id }, data: { stato: "fallito", motivo: "Stripe non configurato", completatoAt: new Date() } });
      return fail("Stripe non configurato", 422);
    }
    const stripe = stripeClient(cfg.stripeSecretKey);
    const intent =
      pay.paymentIntentId ??
      ((await stripe.checkout.sessions.retrieve(pay.sessionId ?? "").catch(() => null))?.payment_intent as string | null) ??
      null;
    if (!intent) {
      await prisma.refund.update({ where: { id: refundRow.id }, data: { stato: "fallito", motivo: "Pagamento non rintracciabile su Stripe", completatoAt: new Date() } });
      return fail("Pagamento non rintracciabile su Stripe: rimborso da fare a mano dal pannello Stripe", 422);
    }
    try {
      const r = await stripe.refunds.create(
        { payment_intent: intent, amount: prenot.importo, metadata: { tenantId: pay.tenantId, paymentId: pay.id } },
        { idempotencyKey: `rimborso:${refundRow.id}` }
      );
      refundId = r.id;
      statoRimborso = statoRimborsoDaStripe(r.status);
    } catch (e) {
      motivoFallimento = e instanceof Error ? e.message : "errore Stripe";
      statoRimborso = "fallito";
    }
    await prisma.refund.update({
      where: { id: refundRow.id },
      data: {
        stato: statoRimborso,
        refundId: refundId ?? undefined,
        motivo: motivoFallimento ?? p.data.motivo,
        completatoAt: statoRimborso === "riuscito" || statoRimborso === "fallito" ? new Date() : null,
      },
    });
    if (motivoFallimento) return fail(`Stripe ha rifiutato il rimborso: ${motivoFallimento}`, 422);
  } else {
    // Rimborso manuale (contanti/POS/bonifico): è l'operatore a restituire il denaro.
    await prisma.refund.update({ where: { id: refundRow.id }, data: { stato: "riuscito", completatoAt: new Date(), motivo: p.data.motivo } });
  }

  const allineato = await allineaRimborsi(pay.id);
  await prisma.auditLog.create({
    data: {
      tenantId: t.tenantId,
      actorId: t.userId,
      azione: "pagamento.rimborso",
      entita: "Payment",
      entitaId: pay.id,
      dettagli: JSON.stringify({ importoCent: prenot.importo, refundId, stato: statoRimborso, provider: pay.provider }),
    },
  });
  return ok({
    id: pay.id,
    stato: allineato?.stato ?? pay.stato,
    rimborsoCent: allineato?.rimborsoCent ?? pay.rimborsoCent,
    refundId,
    refundStato: statoRimborso,
    riutilizzato: false,
  });
}
