import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { calcolaImporti, paymentConfig, stripeClient } from "@/lib/payments";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import type Stripe from "stripe";

// Pagina pubblica di pagamento: accesso consentito solo dal token del link.
// Nessuna autenticazione, ma il token è casuale, monouso di fatto e con scadenza.
async function prenotazioneDaToken(token: string) {
  if (!token || token.length < 16) return null;
  const booking = await prisma.booking.findUnique({
    where: { payToken: token },
    include: { boat: { select: { nome: true } } },
  });
  if (!booking) return null;
  if (booking.payTokenExpires && booking.payTokenExpires < new Date()) return null;
  return booking;
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const booking = await prenotazioneDaToken(token);
  if (!booking) return fail("Link non valido o scaduto", 404);

  const cfg = await paymentConfig(booking.tenantId);
  if (!cfg?.attivi) return fail("Pagamenti non disponibili", 422);

  const accontoCent = booking.prezzoCent ? Math.round((booking.prezzoCent * cfg.accontoPct) / 100) : 0;
  return ok({
    boat: booking.boat?.nome ?? "Imbarcazione",
    data: booking.startAt,
    passeggeri: booking.passeggeri,
    destinazione: booking.destinazione,
    prezzoCent: booking.prezzoCent,
    accontoPct: cfg.accontoPct,
    accontoCent,
    pagato: await prisma.payment.count({
      where: { bookingId: booking.id, tenantId: booking.tenantId, stato: "pagato" },
    }),
    stripeDisponibile: cfg.stripePronto,
    cauzioneCent: booking.cauzioneCent,
    cauzioneStato: booking.cauzioneStato,
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const ip = clientIp(req);
  // Limite per IP: senza sessione, questo endpoint va protetto da sola forza bruta.
  if (!(await rateLimit(`rl:paga-public:${ip}`, 30, 3600)).ok) return fail("Troppi tentativi: riprova più tardi", 429);

  const { token } = await ctx.params;
  const booking = await prenotazioneDaToken(token);
  if (!booking) return fail("Link non valido o scaduto", 404);
  if (!booking.prezzoCent || booking.prezzoCent <= 0) return fail("Prezzo non disponibile", 422);

  const cfg = await paymentConfig(booking.tenantId);
  if (!cfg?.attivi) return fail("Pagamenti non disponibili", 422);
  if (!cfg.stripePronto || !cfg.stripeSecretKey) return fail("Pagamento con carta non disponibile", 422);

  const body = await req.json().catch(() => ({}));
  const tipo = body?.tipo === "totale" ? "totale" : body?.tipo === "cauzione" ? "cauzione" : "acconto";

  // Cauzione: blocco sulla carta, non un incasso.
  if (tipo === "cauzione") {
    if (!booking.cauzioneCent || booking.cauzioneCent <= 0) return fail("Cauzione non prevista per questa prenotazione", 422);
    if (booking.cauzioneStato === "autorizzata") return fail("Cauzione già autorizzata", 422);
    if (booking.checkoutAt) return fail("Noleggio già concluso", 422);

    const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
    const stripeC = stripeClient(cfg.stripeSecretKey);
    let sessione: Stripe.Checkout.Session;
    try {
      sessione = await stripeC.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: booking.cauzioneCent,
              product_data: { name: `Cauzione (blocco sulla carta) - ${booking.boat?.nome ?? "imbarcazione"}` },
            },
          },
        ],
        payment_intent_data: { capture_method: "manual" },
        success_url: `${base}/paga/${token}?esito=cauzione-ok`,
        cancel_url: `${base}/paga/${token}?esito=cauzione-annullata`,
        metadata: { tenantId: booking.tenantId, bookingId: booking.id, tipo: "cauzione" },
      });
    } catch (e) {
      console.error("[paga-public] Stripe cauzione:", e instanceof Error ? e.message : e);
      return fail("Pagamento non disponibile in questo momento: riprova più tardi", 422);
    }
    await prisma.booking.update({ where: { id: booking.id }, data: { cauzioneStato: "in_attesa" } });
    return ok({ url: sessione.url, cauzioneCent: booking.cauzioneCent }, 201);
  }

  // La fee NaBoat si applica solo alle prenotazioni arrivate dal canale NaBoat
  // e solo se l'azienda ha il modulo Marketplace attivo.
  const feeApplicabile = booking.origineCanale === "naboat" && cfg.marketplaceAttivo;
  const imponibile = tipo === "acconto" ? Math.round((booking.prezzoCent * cfg.accontoPct) / 100) : booking.prezzoCent;
  const importi = calcolaImporti(
    imponibile,
    cfg.feeNaboatPct,
    cfg.feeProviderPct,
    cfg.feeProviderFixedCent,
    feeApplicabile
  );
  const commissioneCent = importi.feeNaboatCent + importi.feeProviderCent;

  const descrizione = tipo === "acconto" ? `Acconto ${cfg.accontoPct}%` : "Noleggio";
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: 1,
      price_data: { currency: "eur", unit_amount: importi.importoCent, product_data: { name: `${descrizione} - ${booking.boat?.nome ?? "imbarcazione"}` } },
    },
  ];
  if (commissioneCent > 0) {
    line_items.push({
      quantity: 1,
      price_data: { currency: "eur", unit_amount: commissioneCent, product_data: { name: "Commissioni di servizio" } },
    });
  }

  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const stripe = stripeClient(cfg.stripeSecretKey);
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${base}/paga/${token}?esito=ok`,
      cancel_url: `${base}/paga/${token}?esito=annullato`,
      metadata: { tenantId: booking.tenantId, bookingId: booking.id, tipo },
    });
  } catch (e) {
    console.error("[paga-public] Stripe:", e instanceof Error ? e.message : e);
    return fail("Pagamento non disponibile in questo momento: riprova più tardi", 422);
  }

  await prisma.payment.create({
    data: {
      tenantId: booking.tenantId,
      bookingId: booking.id,
      provider: "stripe",
      tipo,
      importoCent: importi.importoCent,
      feeNaboatCent: importi.feeNaboatCent,
      feeProviderCent: importi.feeProviderCent,
      totaleCent: importi.totaleCent,
      stato: "in_attesa",
      sessionId: session.id,
      descrizione: `${descrizione} · link pubblico`,
    },
  });

  return ok({ url: session.url, totaleCent: importi.totaleCent }, 201);
}
