import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { decryptSecret, stripeClient } from "@/lib/payments";
import type Stripe from "stripe";

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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const tipo = (session.metadata?.tipo ?? "prenotazione") as string;

    // Cauzione: il blocco sulla carta è autorizzato (i soldi NON sono incassati).
    if (tipo === "cauzione") {
      const bookingId = session.metadata?.bookingId;
      if (bookingId) {
        await prisma.booking.updateMany({
          where: { id: bookingId, tenantId },
          data: {
            cauzioneStato: "autorizzata",
            cauzioneIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
          },
        });
        await prisma.auditLog.create({
          data: { tenantId, azione: "cauzione.autorizzata", entita: "Booking", entitaId: bookingId },
        });
      }
      return ok({ received: true });
    }

    const payment = await prisma.payment.findFirst({
      where: { sessionId: session.id, tenantId },
      select: { id: true, stato: true },
    });
    if (payment && payment.stato === "in_attesa") {
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
    }
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    await prisma.payment.updateMany({
      where: { sessionId: session.id, tenantId, stato: "in_attesa" },
      data: { stato: "fallito" },
    });
    // La cauzione abbandonata torna disponibile (altrimenti resterebbe "in attesa" per sempre).
    if (session.metadata?.tipo === "cauzione" && session.metadata?.bookingId) {
      await prisma.booking.updateMany({
        where: { id: session.metadata.bookingId, tenantId, cauzioneStato: "in_attesa" },
        data: { cauzioneStato: "non_richiesta" },
      });
    }
  }

  return ok({ received: true });
}
