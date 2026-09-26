import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { parseImportoEuro, paymentConfig, stripeClient } from "@/lib/payments";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Elenco cauzioni dell'azienda (prenotazioni con cauzione impostata).
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const list = await prisma.booking.findMany({
    where: { tenantId: t.tenantId, cauzioneCent: { not: null } },
    orderBy: { startAt: "desc" },
    take: 100,
    select: {
      id: true,
      startAt: true,
      clienteNome: true,
      cauzioneCent: true,
      cauzioneStato: true,
      danniCent: true,
      boat: { select: { nome: true } },
    },
  });
  return ok(list);
}

// Cauzione con blocco sulla carta: si autorizza una somma (non incassata),
// poi si rilascia al rientro oppure si addebita (in tutto o in parte) se ci sono danni.
const AvviaSchema = z.object({
  bookingId: z.string().uuid(),
  cauzioneEuro: z.string().min(1).max(20),
});

export async function POST(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const p = AvviaSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);

  const cauzioneCent = parseImportoEuro(p.data.cauzioneEuro);
  if (cauzioneCent === null) return fail("Importo cauzione non valido", 422);

  const cfg = await paymentConfig(t.tenantId);
  if (!cfg?.stripePronto || !cfg.stripeSecretKey) return fail("Stripe non configurato o pagamenti disattivati", 422);

  const booking = await prisma.booking.findFirst({
    where: { id: p.data.bookingId, tenantId: t.tenantId },
    include: { boat: { select: { nome: true } } },
  });
  if (!booking) return fail("Prenotazione non trovata", 404);
  if (booking.cauzioneStato === "autorizzata") return fail("Cauzione già autorizzata", 422);
  if (booking.checkoutAt) return fail("Noleggio già chiuso", 422);

  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const stripe = stripeClient(cfg.stripeSecretKey);
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: cauzioneCent,
            product_data: { name: `Cauzione (blocco sulla carta) — ${booking.boat?.nome ?? "imbarcazione"}` },
          },
        },
      ],
      payment_intent_data: { capture_method: "manual" },
      success_url: `${base}/paga/${booking.payToken ?? ""}?esito=cauzione-ok`,
      cancel_url: `${base}/paga/${booking.payToken ?? ""}?esito=cauzione-annullata`,
      metadata: { tenantId: t.tenantId, bookingId: booking.id, tipo: "cauzione" },
    });
  } catch (e) {
    return fail(`Stripe ha rifiutato la richiesta: ${e instanceof Error ? e.message : "errore"}`, 422);
  }

  await prisma.booking.update({
    where: { id: booking.id },
    data: { cauzioneCent, cauzioneStato: "in_attesa" },
  });

  return ok({ url: session.url, cauzioneCent }, 201);
}

const AzioneSchema = z.object({
  azione: z.enum(["rilascia", "addebita"]),
  importoEuro: z.string().max(20).optional().nullable(),
});

export async function PATCH(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("Parametro id obbligatorio", 422);
  const p = AzioneSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Richiesta non valida", 422);

  const booking = await prisma.booking.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!booking) return fail("Prenotazione non trovata", 404);
  if (booking.cauzioneStato !== "autorizzata" || !booking.cauzioneIntentId) {
    return fail("Nessuna cauzione autorizzata su questa prenotazione", 422);
  }

  const cfg = await paymentConfig(t.tenantId);
  if (!cfg?.stripeSecretKey) return fail("Stripe non configurato", 422);
  const stripe = stripeClient(cfg.stripeSecretKey);

  try {
    if (p.data.azione === "rilascia") {
      await stripe.paymentIntents.cancel(booking.cauzioneIntentId);
      const upd = await prisma.booking.update({ where: { id: booking.id }, data: { cauzioneStato: "rilasciata" } });
      await prisma.auditLog.create({
        data: { tenantId: t.tenantId, actorId: t.userId, azione: "cauzione.rilasciata", entita: "Booking", entitaId: booking.id },
      });
      return ok({ cauzioneStato: upd.cauzioneStato });
    }

    let addebitoCent = booking.cauzioneCent ?? 0;
    if (p.data.importoEuro) {
      const richiesto = parseImportoEuro(p.data.importoEuro);
      if (richiesto === null) return fail("Importo non valido", 422);
      addebitoCent = richiesto;
    }
    if (addebitoCent <= 0) return fail("Importo da addebitare non valido", 422);
    const massimo = booking.cauzioneCent ?? addebitoCent;
    if (addebitoCent > massimo) return fail(`Massimo addebitabile: ${(massimo / 100).toFixed(2)} €`, 422);

    await stripe.paymentIntents.capture(booking.cauzioneIntentId, { amount_to_capture: addebitoCent });
    const upd = await prisma.booking.update({ where: { id: booking.id }, data: { cauzioneStato: "addebitata" } });

    // L'addebito della cauzione entra nel registro incassi.
    await prisma.payment.create({
      data: {
        tenantId: t.tenantId,
        bookingId: booking.id,
        provider: "stripe",
        tipo: "totale",
        importoCent: addebitoCent,
        feeNaboatCent: 0,
        feeProviderCent: 0,
        totaleCent: addebitoCent,
        stato: "pagato",
        metodo: "carta",
        paymentIntentId: booking.cauzioneIntentId,
        descrizione: "Addebito cauzione per danni",
        paidAt: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: { tenantId: t.tenantId, actorId: t.userId, azione: "cauzione.addebitata", entita: "Booking", entitaId: booking.id },
    });
    return ok({ cauzioneStato: upd.cauzioneStato, addebitatoCent: addebitoCent });
  } catch (e) {
    return fail(`Stripe ha rifiutato la richiesta: ${e instanceof Error ? e.message : "errore"}`, 422);
  }
}
