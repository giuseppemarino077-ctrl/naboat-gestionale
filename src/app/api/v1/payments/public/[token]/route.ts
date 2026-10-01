import { fail } from "@/lib/api";
import { prisma } from "@/lib/db";
import { avviaCheckoutPrenotazione, calcolaResiduoPrezzo, pagamentiPerBarca, paymentConfig, stripeClient } from "@/lib/payments";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

// C03: risposte con dati di pagamento mai memorizzabili.
function okNoStore(data: unknown, status = 200) {
  const res = NextResponse.json(data, { status });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

// Pagina pubblica di pagamento: accesso consentito solo dal token del link.
// Nessuna autenticazione, ma il token è casuale, monouso di fatto e con scadenza.
async function prenotazioneDaToken(token: string) {
  if (!token || token.length < 16) return null;
  const booking = await prisma.booking.findUnique({
    where: { payToken: token },
    include: { boat: { select: { nome: true } }, payments: true },
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
  const abil = await pagamentiPerBarca(booking.tenantId, booking.boatId);
  if (!abil.abilitati) return fail(abil.motivo ?? "Pagamenti online non disponibili", 422);

  const residuo = calcolaResiduoPrezzo(booking.prezzoCent ?? 0, booking.payments, {
    cauzioneIntentId: booking.cauzioneIntentId,
  });
  const accontoPrevisto = booking.prezzoCent ? Math.round((booking.prezzoCent * cfg.accontoPct) / 100) : 0;
  return okNoStore({
    boat: booking.boat?.nome ?? "Imbarcazione",
    data: booking.startAt,
    passeggeri: booking.passeggeri,
    destinazione: booking.destinazione,
    prezzoCent: booking.prezzoCent,
    accontoPct: cfg.accontoPct,
    accontoCent: Math.min(accontoPrevisto, residuo.residuoCent),
    // Residuo effettivo del prezzo e distinzione delle componenti.
    residuoCent: residuo.residuoCent,
    capitaleIncassatoCent: residuo.capitaleIncassatoCent,
    commissioniIncassateCent: residuo.commissioniIncassateCent,
    cauzioneIncassataCent: residuo.cauzioneIncassataCent,
    inAttesaCent: residuo.inAttesaCent,
    pagato: await prisma.payment.count({
      where: { bookingId: booking.id, tenantId: booking.tenantId, stato: "pagato" },
    }),
    stripeDisponibile: cfg.stripePronto,
    cauzioneCent: booking.cauzioneCent,
    cauzioneStato: booking.cauzioneStato,
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const booking = await prenotazioneDaToken(token);
  if (!booking) return fail("Link non valido o scaduto", 404);
  // Un token di lettura non autorizza un nuovo addebito su prenotazioni chiuse.
  if (booking.stato === "cancellata") return fail("Prenotazione annullata: nessun nuovo addebito", 422);
  if (booking.stato === "no_show") return fail("Prenotazione chiusa: nessun nuovo addebito", 422);
  if (!booking.prezzoCent || booking.prezzoCent <= 0) return fail("Prezzo non disponibile", 422);

  const cfg = await paymentConfig(booking.tenantId);
  if (!cfg?.attivi) return fail("Pagamenti non disponibili", 422);
  const abil = await pagamentiPerBarca(booking.tenantId, booking.boatId);
  if (!abil.abilitati) return fail(abil.motivo ?? "Pagamenti online non disponibili", 422);
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
              product_data: { name: `Cauzione (blocco sulla carta) — ${booking.boat?.nome ?? "imbarcazione"}` },
            },
          },
        ],
        payment_intent_data: { capture_method: "manual" },
        success_url: `${base}/paga/${token}?esito=cauzione-ok`,
        cancel_url: `${base}/paga/${token}?esito=cauzione-annullata`,
        metadata: { tenantId: booking.tenantId, bookingId: booking.id, tipo: "cauzione" },
      });
    } catch (e) {
      return fail(`Stripe ha rifiutato la richiesta: ${e instanceof Error ? e.message : "errore"}`, 422);
    }
    await prisma.booking.update({ where: { id: booking.id }, data: { cauzioneStato: "in_attesa" } });
    return okNoStore({ url: sessione.url, cauzioneCent: booking.cauzioneCent }, 201);
  }

  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const esito = await avviaCheckoutPrenotazione({
    cfg,
    booking: {
      id: booking.id,
      tenantId: booking.tenantId,
      prezzoCent: booking.prezzoCent,
      origineCanale: booking.origineCanale,
      cauzioneIntentId: booking.cauzioneIntentId,
      boatNome: booking.boat?.nome ?? "imbarcazione",
      pagamenti: booking.payments,
    },
    tipo,
    successUrl: `${base}/paga/${token}?esito=ok`,
    cancelUrl: `${base}/paga/${token}?esito=annullato`,
  });
  if (esito.esito === "errore") return fail(esito.messaggio, esito.stato);

  return okNoStore(
    {
      paymentId: esito.paymentId,
      url: esito.url,
      importoCent: esito.importoCent,
      commissioneCent: esito.commissioneCent,
      totaleCent: esito.totaleCent,
      residuoCent: esito.residuoCent,
      riutilizzato: esito.riutilizzato,
    },
    esito.stato
  );
}
