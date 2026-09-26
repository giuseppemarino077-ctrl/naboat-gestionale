import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import type Stripe from "stripe";

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const sub = await prisma.subscription.findFirst({
      where: { sessionId: session.id },
      select: { id: true, tenantId: true, stato: true },
    });
    if (sub && sub.stato === "in_attesa") {
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
    }
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    await prisma.subscription.updateMany({
      where: { sessionId: session.id, stato: "in_attesa" },
      data: { stato: "annullato" },
    });
  }

  return ok({ received: true });
}
