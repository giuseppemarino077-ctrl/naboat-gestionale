import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { avviaCheckoutPrenotazione, pagamentiPerBarca, paymentConfig } from "@/lib/payments";
import { requireAzienda } from "@/lib/tenant";
import { randomUUID } from "crypto";
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
    select: { id: true, boatId: true, payToken: true, prezzoCent: true, payTokenExpires: true },
  });
  if (!booking) return fail("Prenotazione non trovata", 404);
  // Unica regola: azienda abilitata E barca non disattivata (l'eccezione barca
  // non può aggirare il blocco aziendale).
  const abil = await pagamentiPerBarca(t.tenantId, booking.boatId);
  if (!abil.abilitati) return fail(abil.motivo ?? "Pagamenti online non disponibili per questa barca", 422);
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
// L'origine del canale NON si legge dal corpo: è quella della prenotazione
// (eventualmente corretta solo da NaBoat, con tracciamento).
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
    include: { boat: { select: { nome: true } }, payments: true },
  });
  if (!booking) return fail("Prenotazione non trovata", 404);
  if (booking.stato === "cancellata") return fail("Prenotazione annullata: nessun nuovo addebito", 422);
  const abil = await pagamentiPerBarca(t.tenantId, booking.boatId);
  if (!abil.abilitati) return fail(abil.motivo ?? "Pagamenti online non disponibili per questa barca", 422);
  if (!booking.prezzoCent || booking.prezzoCent <= 0) return fail("Prezzo non impostato sulla prenotazione", 422);

  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const token = booking.payToken ?? randomUUID().replace(/-/g, "");
  if (!booking.payToken) {
    await prisma.booking.update({ where: { id: booking.id }, data: { payToken: token } });
  }

  const esito = await avviaCheckoutPrenotazione({
    cfg,
    booking: {
      id: booking.id,
      tenantId: booking.tenantId,
      prezzoCent: booking.prezzoCent,
      origineCanale: booking.origineCanale,
      cauzioneIntentId: booking.cauzioneIntentId,
      boatNome: booking.boat?.nome ?? "noleggio",
      pagamenti: booking.payments,
    },
    tipo: p.data.tipo,
    successUrl: `${base}/paga/${token}?esito=ok`,
    cancelUrl: `${base}/paga/${token}?esito=annullato`,
  });
  if (esito.esito === "errore") return fail(esito.messaggio, esito.stato);

  return ok(
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
