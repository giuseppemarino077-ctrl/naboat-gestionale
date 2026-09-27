import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { calcolaImporti, paymentConfig, stripeClient } from "@/lib/payments";
import { requireAzienda } from "@/lib/tenant";
import { randomUUID } from "crypto";
import type Stripe from "stripe";
import { z } from "zod";

// Genera (o restituisce) il link pubblico di pagamento di una prenotazione.
const LinkSchema = z.object({
  bookingId: z.string().uuid(),
  giorniValidita: z.number().int().min(1).max(90).default(7),
});

export async function POST(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const p = LinkSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Richiesta non valida", 422);

  const cfg = await paymentConfig(t.tenantId);
  if (!cfg) return fail("Azienda non trovata", 404);
  if (!cfg.attivi) return fail("Pagamenti non attivi per questa azienda", 422);

  const booking = await prisma.booking.findFirst({
    where: { id: p.data.bookingId, tenantId: t.tenantId },
    select: { id: true, payToken: true, prezzoCent: true, payTokenExpires: true },
  });
  if (!booking) return fail("Prenotazione non trovata", 404);
  if (!booking.prezzoCent || booking.prezzoCent <= 0) {
    return fail("Prezzo non impostato: inserisci il prezzo della prenotazione", 422);
  }

  const scadenza = new Date(Date.now() + p.data.giorniValidita * 86400 * 1000);
  const token = booking.payToken ?? randomUUID().replace(/-/g, "");
  await prisma.booking.update({
    where: { id: booking.id },
    data: { payToken: token, payTokenExpires: scadenza },
  });

  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  return ok({ url: `${base}/paga/${token}`, scadenza });
}

// Avvia il pagamento (Checkout Stripe) per una prenotazione dell'azienda.
// Il canale non è un input dell'azienda (decide la fee NaBoat): si legge dalla prenotazione.
const CheckoutSchema = z.object({
  bookingId: z.string().uuid(),
  tipo: z.enum(["acconto", "saldo", "totale"]).default("acconto"),
});

export async function PUT(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const p = CheckoutSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Richiesta non valida", 422);

  const cfg = await paymentConfig(t.tenantId);
  if (!cfg?.stripePronto || !cfg.stripeSecretKey) {
    return fail("Stripe non configurato o pagamenti disattivati", 422);
  }

  const booking = await prisma.booking.findFirst({
    where: { id: p.data.bookingId, tenantId: t.tenantId },
    include: { boat: { select: { nome: true } } },
  });
  if (!booking) return fail("Prenotazione non trovata", 404);
  if (!booking.prezzoCent || booking.prezzoCent <= 0) return fail("Prezzo non impostato sulla prenotazione", 422);

  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");

  // Il costo del noleggio è quello del canale; la fee matura solo se l'opportunità arriva da NaBoat
  // e se il modulo Marketplace è attivo per questa azienda (RFQ D1/D3).
  const feeApplicabile = booking.origineCanale === "naboat" && cfg.marketplaceAttivo;
  const imponibile =
    p.data.tipo === "acconto" ? Math.round((booking.prezzoCent * cfg.accontoPct) / 100) : booking.prezzoCent;
  const importi = calcolaImporti(
    imponibile,
    cfg.feeNaboatPct,
    cfg.feeProviderPct,
    cfg.feeProviderFixedCent,
    feeApplicabile
  );

  // RFQ D7: al cliente si mostra una sola voce di commissione (fee NaBoat + commissione fornitore).
  const commissioneCent = importi.feeNaboatCent + importi.feeProviderCent;
  const descrizioneBase =
    p.data.tipo === "acconto"
      ? `Acconto ${cfg.accontoPct}% - ${booking.boat?.nome ?? "noleggio"}`
      : `Noleggio - ${booking.boat?.nome ?? "noleggio"}`;

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: importi.importoCent,
        product_data: { name: descrizioneBase },
      },
    },
  ];
  if (commissioneCent > 0) {
    line_items.push({
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: commissioneCent,
        product_data: { name: "Commissioni di servizio" },
      },
    });
  }

  const token = booking.payToken ?? randomUUID().replace(/-/g, "");
  const stripe = stripeClient(cfg.stripeSecretKey);

  // Doppio clic: se esiste già una sessione aperta per lo stesso tipo, si riusa.
  const esistente = await prisma.payment.findFirst({
    where: {
      tenantId: t.tenantId,
      bookingId: booking.id,
      tipo: p.data.tipo,
      stato: "in_attesa",
      provider: "stripe",
      sessionId: { not: null },
      createdAt: { gt: new Date(Date.now() - 30 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, sessionId: true, totaleCent: true },
  });
  if (esistente?.sessionId) {
    try {
      const s = await stripe.checkout.sessions.retrieve(esistente.sessionId);
      if (s.status === "open" && s.url) {
        return ok({ paymentId: esistente.id, url: s.url, totaleCent: esistente.totaleCent }, 200);
      }
      await prisma.payment.update({ where: { id: esistente.id }, data: { stato: "fallito" } });
    } catch {
      // sessione non recuperabile: si crea una nuova sessione
    }
  }

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${base}/paga/${token}?esito=ok`,
      cancel_url: `${base}/paga/${token}?esito=annullato`,
      metadata: { tenantId: t.tenantId, bookingId: booking.id, tipo: p.data.tipo },
    });
  } catch (e) {
    console.error("[checkout] Stripe:", e instanceof Error ? e.message : e);
    return fail("Pagamento non disponibile in questo momento: riprova più tardi", 422);
  }

  const payment = await prisma.payment.create({
    data: {
      tenantId: t.tenantId,
      bookingId: booking.id,
      provider: "stripe",
      tipo: p.data.tipo,
      importoCent: importi.importoCent,
      feeNaboatCent: importi.feeNaboatCent,
      feeProviderCent: importi.feeProviderCent,
      totaleCent: importi.totaleCent,
      stato: "in_attesa",
      sessionId: session.id,
      descrizione: `${descrizioneBase} · canale ${booking.origineCanale}`,
    },
  });
  await prisma.booking.update({
    where: { id: booking.id },
    data: { payToken: token },
  });

  return ok({ paymentId: payment.id, url: session.url, totaleCent: importi.totaleCent }, 201);
}
