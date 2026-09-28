import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { calcolaRimborso, feeNaBoatApplicabile, parseImportoEuro, paymentConfig, snapshotCondizioni, stripeClient, rimborsoAmmesso } from "@/lib/payments";
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
});

// Rimborso (RFQ D8): ammesso solo fino a N ore prima dell'uscita, parziale per regola.
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
  if (pay.stato !== "pagato" && pay.stato !== "rimborsato_parziale") return fail("Incasso non rimborsabile", 422);

  const cfg = await paymentConfig(t.tenantId);
  const oreMinime = cfg?.rimborsoOreMinime ?? 24;
  const startAt = pay.booking?.startAt;
  if (startAt && !rimborsoAmmesso(startAt, oreMinime)) {
    return fail(`Rimborso non ammesso: consentito solo fino a ${oreMinime} ore prima dell'uscita`, 422);
  }

  const residuo = pay.totaleCent - pay.rimborsoCent;
  let rimborsoCent: number;
  if (p.data.completo) {
    rimborsoCent = residuo;
  } else if (p.data.importoEuro) {
    const richiesto = parseImportoEuro(p.data.importoEuro);
    if (richiesto === null) return fail("Importo rimborso non valido", 422);
    rimborsoCent = Math.min(richiesto, residuo);
  } else {
    rimborsoCent = Math.min(calcolaRimborso(pay.importoCent, cfg?.rimborsoPct ?? 100), residuo);
  }
  if (rimborsoCent <= 0) return fail("Nessun importo rimborsabile con la regola attuale", 422);

  let refundId: string | null = null;
  if (pay.provider === "stripe") {
    if (!cfg?.stripeSecretKey) return fail("Stripe non configurato", 422);
    const stripe = stripeClient(cfg.stripeSecretKey);
    const intent =
      pay.paymentIntentId ??
      ((await stripe.checkout.sessions.retrieve(pay.sessionId ?? "").catch(() => null))?.payment_intent as string | null) ??
      null;
    if (!intent) return fail("Pagamento non rintracciabile su Stripe: rimborso da fare a mano dal pannello Stripe", 422);
    const r = await stripe.refunds.create({ payment_intent: intent, amount: rimborsoCent });
    refundId = r.id;
  }

  const totaleRimborsato = pay.rimborsoCent + rimborsoCent;
  const updated = await prisma.payment.update({
    where: { id: pay.id },
    data: {
      rimborsoCent: totaleRimborsato,
      stato: totaleRimborsato >= pay.totaleCent ? "rimborsato" : "rimborsato_parziale",
    },
  });
  await prisma.auditLog.create({
    data: { tenantId: t.tenantId, actorId: t.userId, azione: "pagamento.rimborso", entita: "Payment", entitaId: pay.id },
  });
  return ok({ id: updated.id, stato: updated.stato, rimborsoCent: updated.rimborsoCent, refundId });
}
