import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { incassoBody } from "@/lib/mailer";
import { accodaEProva } from "@/lib/notifiche";
import { allineaRimborsi, decryptSecret, formattaEuro, statoRimborsoDaStripe, stripeClient } from "@/lib/payments";
import type Stripe from "stripe";

const STATI_CHIUSI = ["elaborato", "ignorato"];

// Webhook Stripe. Nessuna sessione: l'autenticazione è la firma del webhook.
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return fail("Firma mancante", 400);

  // Il tenant si legge dal corpo non ancora verificato, poi si verifica la firma con il suo segreto:
  // senza il segreto giusto l'evento viene rifiutato.
  let preliminare: { data?: { object?: { metadata?: { tenantId?: string }; payment_intent?: unknown } } };
  try {
    preliminare = JSON.parse(body);
  } catch {
    return fail("Corpo non valido", 400);
  }
  // Il tenant arriva dai metadata; per gli eventi che ne sono privi (es. rimborsi
  // avviati dal Dashboard Stripe) si risale dall'incasso tramite il payment_intent.
  let tenantId = preliminare.data?.object?.metadata?.tenantId;
  if (!tenantId) {
    const pi = preliminare.data?.object?.payment_intent;
    const intent = typeof pi === "string" ? pi : (pi as { id?: string } | undefined)?.id;
    if (intent) {
      const pagamento = await prisma.payment.findFirst({ where: { paymentIntentId: intent }, select: { tenantId: true } });
      tenantId = pagamento?.tenantId ?? undefined;
    }
  }
  if (!tenantId) return fail("tenantId mancante nei metadata", 400);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { stripeWebhookEnc: true },
  });
  if (!tenant?.stripeWebhookEnc) return fail("Webhook non configurato per l'azienda", 400);

  let event: Stripe.Event;
  try {
    const stripe = stripeClient("sk_dummy");
    event = stripe.webhooks.constructEvent(body, signature, decryptSecret(tenant.stripeWebhookEnc));
  } catch (e) {
    return fail(`Firma non valida: ${e instanceof Error ? e.message : "errore"}`, 400);
  }

  // Registro degli eventi: rende l'elaborazione idempotente e recuperabile.
  let evento;
  try {
    evento = await prisma.stripeEvent.upsert({
      where: { eventId: event.id },
      update: {},
      create: {
        eventId: event.id,
        tenantId,
        tipo: event.type,
        stato: "ricevuto",
        payload: JSON.parse(body),
      },
    });
  } catch {
    // Non si riconosce l'evento come elaborato: Stripe ritenterà.
    return fail("Impossibile registrare l'evento", 500);
  }
  if (STATI_CHIUSI.includes(evento.stato)) return ok({ received: true, duplicato: true });

  const chiudi = async (stato: string, motivo?: string) => {
    await prisma.stripeEvent.update({
      where: { id: evento.id },
      data: { stato, motivo: motivo ?? null, elaboratoAt: stato === "in_attesa_record" ? null : new Date() },
    });
  };

  // --- Cauzione: autorizzazione, non incasso. Trattata separatamente. ---
  const gestisciCauzione = async (session: Stripe.Checkout.Session) => {
    const bookingId = session.metadata?.bookingId;
    if (!bookingId) return chiudi("errore", "bookingId mancante");
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, tenantId },
      select: { id: true, cauzioneCent: true, cauzioneStato: true },
    });
    if (!booking) return chiudi("in_attesa_record", "prenotazione non ancora presente");
    if (booking.cauzioneStato === "autorizzata") return chiudi("elaborato", "già autorizzata");

    const valuta = (session.currency ?? "").toLowerCase();
    const importo = session.amount_total ?? null;
    if (session.amount_total != null && booking.cauzioneCent != null && importo !== booking.cauzioneCent) {
      return chiudi("errore", "importo cauzione diverso dal previsto");
    }
    if (valuta && valuta !== "eur") return chiudi("errore", "valuta non prevista");

    await prisma.booking.updateMany({
      where: { id: booking.id, tenantId },
      data: {
        cauzioneStato: "autorizzata",
        cauzioneIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      },
    });
    await prisma.auditLog.create({
      data: { tenantId, azione: "cauzione.autorizzata", entita: "Booking", entitaId: booking.id },
    });
    return chiudi("elaborato");
  };

  // --- Incasso di un acconto/saldo: solo se davvero pagato. ---
  const gestisciIncasso = async (session: Stripe.Checkout.Session) => {
    const payment = await prisma.payment.findFirst({
      where: { sessionId: session.id, tenantId },
      select: { id: true, stato: true, totaleCent: true, valuta: true },
    });
    if (!payment) return chiudi("in_attesa_record", "incasso non ancora presente");
    // Un evento duplicato o fuori ordine non deve far regredire un incasso riuscito.
    if (payment.stato !== "in_attesa") return chiudi("elaborato", "già applicato");

    const pagato = session.payment_status === "paid" || session.payment_status === "no_payment_required";
    if (!pagato) return chiudi("ignorato", `payment_status=${session.payment_status ?? "assente"}`);

    const valuta = (session.currency ?? "").toLowerCase();
    if (valuta && payment.valuta && valuta !== payment.valuta.toLowerCase()) {
      return chiudi("errore", "valuta diversa dall'incasso atteso");
    }
    if (session.amount_total != null && session.amount_total !== payment.totaleCent) {
      return chiudi("errore", "importo diverso dall'incasso atteso");
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        stato: "pagato",
        paidAt: new Date(),
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
        metodo: session.payment_method_types?.[0] ?? "carta",
      },
    });
    await prisma.auditLog.create({
      data: { tenantId, azione: "pagamento.incassato", entita: "Payment", entitaId: payment.id },
    });
    // Avviso al titolare dell'incasso, via outbox (una notifica per incasso).
    try {
      const det = await prisma.payment.findUnique({
        where: { id: payment.id },
        select: {
          totaleCent: true,
          booking: { select: { boat: { select: { nome: true } } } },
          permanenza: { select: { boat: { select: { nome: true } }, posto: { select: { codice: true } } } },
        },
      });
      const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { nome: true } });
      const owner = await prisma.user.findFirst({ where: { tenantId, role: "owner" }, select: { email: true } });
      if (det && t && owner?.email) {
        const descrizione = det.booking
          ? `Noleggio — ${det.booking.boat?.nome ?? "imbarcazione"}`
          : det.permanenza
            ? `Permanenza posto ${det.permanenza.posto?.codice ?? ""} — ${det.permanenza.boat?.nome ?? "imbarcazione"}`
            : "Incasso";
        const corpo = incassoBody({ azienda: t.nome, descrizione, importo: formattaEuro(det.totaleCent) });
        await accodaEProva({
          tenantId,
          evento: "pagamento.incassato",
          destinatario: owner.email,
          oggetto: corpo.subject,
          testo: corpo.text,
          html: corpo.html,
          dedupKey: `pagamento.incassato:${payment.id}`,
        });
      }
    } catch { /* l'avviso non deve bloccare l'elaborazione del webhook */ }
    return chiudi("elaborato");
  };

  // --- Rimborsi: riconcilia sia quelli avviati da noi sia quelli fatti dal Dashboard. ---
  // L'esito reale non è "Stripe ha accettato": si aspetta lo stato definitivo del
  // rimborso e solo allora si aggiorna Payment.rimborsoCent. L'operazione è
  // idempotente (una riga per refundId) e non fa mai tornare indietro un "riuscito".
  const sincronizzaRimborso = async (
    refund: Stripe.Refund,
    paymentIdHint: string | null
  ): Promise<"ok" | "in_attesa_record" | "errore"> => {
    const importoCent = typeof refund.amount === "number" ? refund.amount : 0;
    const intent = typeof refund.payment_intent === "string" ? refund.payment_intent : refund.payment_intent?.id ?? null;
    let paymentId = paymentIdHint ?? refund.metadata?.paymentId ?? null;
    if (!paymentId && intent) {
      const pag = await prisma.payment.findFirst({ where: { paymentIntentId: intent, tenantId }, select: { id: true } });
      paymentId = pag?.id ?? null;
    }
    if (!paymentId) return "in_attesa_record";
    const pag = await prisma.payment.findFirst({ where: { id: paymentId, tenantId }, select: { id: true } });
    if (!pag) return "errore";

    const stato = statoRimborsoDaStripe(refund.status);
    const esistente = await prisma.refund.findUnique({ where: { refundId: refund.id }, select: { id: true, stato: true } });
    if (esistente) {
      if (esistente.stato === "riuscito" && stato !== "riuscito") return "ok";
      await prisma.refund.update({
        where: { id: esistente.id },
        data: {
          stato,
          importoCent,
          completatoAt: stato === "riuscito" || stato === "fallito" ? new Date() : null,
        },
      });
    } else {
      await prisma.refund.create({
        data: {
          tenantId,
          paymentId: pag.id,
          importoCent,
          stato,
          provider: "stripe",
          refundId: refund.id,
          motivo: "riconciliato dal webhook Stripe",
          completatoAt: stato === "riuscito" || stato === "fallito" ? new Date() : null,
        },
      });
      await prisma.auditLog.create({
        data: {
          tenantId,
          azione: "pagamento.rimborso.riconciliato",
          entita: "Payment",
          entitaId: pag.id,
          dettagli: JSON.stringify({ refundId: refund.id, importoCent, stato }),
        },
      });
    }
    await allineaRimborsi(pag.id);
    return "ok";
  };

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    const tipo = (session.metadata?.tipo ?? "prenotazione") as string;
    if (tipo === "cauzione") {
      await gestisciCauzione(session);
    } else {
      await gestisciIncasso(session);
    }
    return ok({ received: true });
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    // Solo gli intenti ancora in attesa: non si tocca un incasso già riuscito.
    await prisma.payment.updateMany({
      where: { sessionId: session.id, tenantId, stato: "in_attesa" },
      data: { stato: "fallito" },
    });
    await chiudi("elaborato");
    return ok({ received: true });
  }

  // Eventi di rimborso: l'oggetto è un Refund (anche per quelli creati dal Dashboard).
  const tipoEvento = event.type as string;
  if (tipoEvento === "refund.created" || tipoEvento === "refund.updated" || tipoEvento === "refund.failed") {
    const esito = await sincronizzaRimborso(event.data.object as Stripe.Refund, null);
    if (esito === "in_attesa_record") return chiudi("in_attesa_record", "incasso non ancora presente");
    if (esito === "errore") return chiudi("errore", "incasso non appartenente all'azienda");
    return chiudi("elaborato");
  }

  // Rimborso totale/parziale registrato sull'addebito: si sincronizzano tutti i
  // rimborsi presenti sull'oggetto Charge.
  if (tipoEvento === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
    if (!intent) return chiudi("ignorato", "charge senza payment_intent");
    const pag = await prisma.payment.findFirst({ where: { paymentIntentId: intent, tenantId }, select: { id: true } });
    if (!pag) return chiudi("in_attesa_record", "incasso non ancora presente");
    for (const r of charge.refunds?.data ?? []) await sincronizzaRimborso(r, pag.id);
    return chiudi("elaborato");
  }

  await chiudi("ignorato", `evento non gestito: ${event.type}`);
  return ok({ received: true });
}
