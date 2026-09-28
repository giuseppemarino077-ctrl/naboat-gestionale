import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { decryptSecret, stripeClient } from "@/lib/payments";
import type Stripe from "stripe";

const STATI_CHIUSI = ["elaborato", "ignorato"];

// Webhook Stripe. Nessuna sessione: l'autenticazione è la firma del webhook.
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return fail("Firma mancante", 400);

  // Il tenant si legge dal corpo non ancora verificato, poi si verifica la firma con il suo segreto:
  // senza il segreto giusto l'evento viene rifiutato.
  let preliminare: { data?: { object?: { metadata?: { tenantId?: string } } } };
  try {
    preliminare = JSON.parse(body);
  } catch {
    return fail("Corpo non valido", 400);
  }
  const tenantId = preliminare.data?.object?.metadata?.tenantId;
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
    return chiudi("elaborato");
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

  await chiudi("ignorato", `evento non gestito: ${event.type}`);
  return ok({ received: true });
}
