import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import type Stripe from "stripe";

const STATI_CHIUSI = ["elaborato", "ignorato"];

// Webhook Stripe dell'account NaBoat (abbonamenti stagionali).
// L'autenticazione è la firma, verificata con PLATFORM_STRIPE_WEBHOOK_SECRET.
export async function POST(req: Request) {
  const secret = process.env.PLATFORM_STRIPE_WEBHOOK_SECRET;
  if (!secret) return fail("Webhook abbonamenti non configurato", 400);

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return fail("Firma mancante", 400);

  let event: Stripe.Event;
  try {
    const { default: StripeSdk } = await import("stripe");
    const stripe = new StripeSdk("sk_dummy", { typescript: true });
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (e) {
    return fail(`Firma non valida: ${e instanceof Error ? e.message : "errore"}`, 400);
  }

  const tenantId =
    typeof event.data.object === "object" && event.data.object && "metadata" in event.data.object
      ? ((event.data.object as { metadata?: { tenantId?: string } }).metadata?.tenantId ?? null)
      : null;

  // Registro degli eventi: idempotenza e recupero degli eventi arrivati in anticipo.
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
    return fail("Impossibile registrare l'evento", 500);
  }
  if (STATI_CHIUSI.includes(evento.stato)) return ok({ received: true, duplicato: true });

  const chiudi = async (stato: string, motivo?: string) => {
    await prisma.stripeEvent.update({
      where: { id: evento.id },
      data: { stato, motivo: motivo ?? null, elaboratoAt: stato === "in_attesa_record" ? null : new Date() },
    });
  };

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    const sub = await prisma.subscription.findFirst({
      where: { sessionId: session.id },
      select: { id: true, tenantId: true, stato: true, prezzoCent: true },
    });
    if (!sub) {
      await chiudi("in_attesa_record", "abbonamento non ancora presente");
      return ok({ received: true });
    }
    if (sub.stato !== "in_attesa") {
      await chiudi("elaborato", "già applicato");
      return ok({ received: true });
    }

    const pagato = session.payment_status === "paid" || session.payment_status === "no_payment_required";
    if (!pagato) {
      await chiudi("ignorato", `payment_status=${session.payment_status ?? "assente"}`);
      return ok({ received: true });
    }
    const valuta = (session.currency ?? "").toLowerCase();
    if (valuta && valuta !== "eur") {
      await chiudi("errore", "valuta non prevista");
      return ok({ received: true });
    }
    if (session.amount_total != null && session.amount_total !== sub.prezzoCent) {
      await chiudi("errore", "importo diverso dall'abbonamento atteso");
      return ok({ received: true });
    }

    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        stato: "attivo",
        paidAt: new Date(),
        metodo: session.payment_method_types?.[0] ?? "carta",
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      },
    });
    await prisma.auditLog.create({
      data: { tenantId: sub.tenantId, azione: "abbonamento.attivato", entita: "Subscription", entitaId: sub.id },
    });
    await chiudi("elaborato");
    return ok({ received: true });
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    await prisma.subscription.updateMany({
      where: { sessionId: session.id, stato: "in_attesa" },
      data: { stato: "annullato" },
    });
    await chiudi("elaborato");
    return ok({ received: true });
  }

  await chiudi("ignorato", `evento non gestito: ${event.type}`);
  return ok({ received: true });
}
