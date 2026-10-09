import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { stripeClient, calcolaResiduoPrezzo, calcolaImporti, feeNaBoatApplicabile, snapshotCondizioni, type PaymentConfig, type PagamentoPerResiduo } from "@/modules/piattaforma/pagamenti";

export type EsitoCheckout =
  | {
      esito: "ok";
      stato: number; // 200 = intento pendente riusato, 201 = nuovo intento
      riutilizzato: boolean;
      paymentId: string;
      url: string;
      importoCent: number;
      commissioneCent: number;
      totaleCent: number;
      residuoCent: number;
    }
  | { esito: "errore"; stato: number; messaggio: string };

// Avvia (o riusa) il Checkout Stripe di un acconto/saldo partendo dal residuo effettivo.
// L'intento locale viene creato PRIMA di chiamare Stripe e la duplicazione è impedita
// da un lock per prenotazione: non nascono due Checkout incassabili sullo stesso residuo.
export async function avviaCheckoutPrenotazione(opts: {
  cfg: PaymentConfig;
  booking: {
    id: string;
    tenantId: string;
    prezzoCent: number | null;
    origineCanale: string | null;
    cauzioneIntentId: string | null;
    boatNome: string;
    pagamenti: PagamentoPerResiduo[];
  };
  tipo: "acconto" | "saldo" | "totale";
  successUrl: string;
  cancelUrl: string;
}): Promise<EsitoCheckout> {
  const { cfg, booking, tipo } = opts;
  if (!cfg.stripeSecretKey) return { esito: "errore", stato: 422, messaggio: "Stripe non configurato o pagamenti disattivati" };

  const prezzoCent = booking.prezzoCent ?? 0;
  if (prezzoCent <= 0) return { esito: "errore", stato: 422, messaggio: "Prezzo non impostato sulla prenotazione" };

  const stripe = stripeClient(cfg.stripeSecretKey);
  const pendenti = booking.pagamenti.filter((p) => p.stato === "in_attesa" && (p.provider ?? "stripe") === "stripe");

  // Niente Checkout se il prezzo è già saldato: si annullano anche gli intenti ancora aperti,
  // così un vecchio link non può incassare un residuo ormai coperto.
  const residuo = calcolaResiduoPrezzo(prezzoCent, booking.pagamenti, { cauzioneIntentId: booking.cauzioneIntentId });
  if (residuo.residuoCent <= 0) {
    for (const p of pendenti) {
      if (!p.id || !p.sessionId) continue;
      try {
        const s = await stripe.checkout.sessions.retrieve(p.sessionId);
        if (s.status === "open") await stripe.checkout.sessions.expire(s.id);
      } catch {
        /* la sessione scadrà da sola */
      }
      await prisma.payment.updateMany({ where: { id: p.id, tenantId: booking.tenantId, stato: "in_attesa" }, data: { stato: "fallito" } });
    }
    return { esito: "errore", stato: 422, messaggio: "Il prezzo risulta già saldato" };
  }

  const nominale = tipo === "acconto" ? Math.round((prezzoCent * cfg.accontoPct) / 100) : residuo.residuoCent;
  const importoCent = Math.min(Math.max(nominale, 0), residuo.residuoCent);
  if (importoCent <= 0) return { esito: "errore", stato: 422, messaggio: "Nessun importo da pagare" };

  const origine = booking.origineCanale ?? "diretto";
  const importi = calcolaImporti(importoCent, cfg.feeNaboatPct, cfg.feeProviderPct, cfg.feeProviderFixedCent, feeNaBoatApplicabile(origine, cfg));
  const commissioneCent = importi.feeNaboatCent + importi.feeProviderCent;
  const descrizione = tipo === "acconto" ? `Acconto ${cfg.accontoPct}%` : tipo === "saldo" ? "Saldo noleggio" : "Noleggio";
  const nomeBarca = booking.boatNome || "noleggio";

  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: 1,
      price_data: { currency: "eur", unit_amount: importi.importoCent, product_data: { name: `${descrizione} — ${nomeBarca}` } },
    },
  ];
  if (commissioneCent > 0) {
    line_items.push({
      quantity: 1,
      price_data: { currency: "eur", unit_amount: commissioneCent, product_data: { name: "Commissioni di servizio" } },
    });
  }

  // Riusa un intento pendente ancora aperto; annulla gli intenti non più validi.
  for (const p of pendenti) {
    if (!p.id) continue;
    if (!p.sessionId) {
      const vecchio = p.createdAt ? Date.now() - new Date(p.createdAt).getTime() > 15 * 60 * 1000 : false;
      if (!vecchio) return { esito: "errore", stato: 409, messaggio: "Un pagamento è già in corso su questa prenotazione: riprova tra qualche istante" };
      await prisma.payment.updateMany({ where: { id: p.id, tenantId: booking.tenantId, stato: "in_attesa" }, data: { stato: "fallito" } });
      continue;
    }
    let sessione: Stripe.Checkout.Session | null = null;
    try {
      sessione = await stripe.checkout.sessions.retrieve(p.sessionId);
    } catch {
      sessione = null;
    }
    if (
      sessione &&
      sessione.status === "open" &&
      sessione.url &&
      sessione.amount_total === importi.totaleCent &&
      sessione.metadata?.tipo === tipo &&
      sessione.metadata?.bookingId === booking.id
    ) {
      return { esito: "ok", stato: 200, riutilizzato: true, paymentId: p.id, url: sessione.url, importoCent, commissioneCent, totaleCent: importi.totaleCent, residuoCent: residuo.residuoCent };
    }
    try {
      if (sessione && sessione.status === "open") await stripe.checkout.sessions.expire(sessione.id);
    } catch {
      /* la sessione scadrà da sola */
    }
    await prisma.payment.updateMany({ where: { id: p.id, tenantId: booking.tenantId, stato: "in_attesa" }, data: { stato: "fallito" } });
  }

  // Lock per prenotazione: due schede/operatori non creano due intenti sullo stesso residuo.
  const creato = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${booking.id}`}))`;
    const esistente = await tx.payment.findFirst({
      where: { bookingId: booking.id, tenantId: booking.tenantId, provider: "stripe", stato: "in_attesa" },
      orderBy: { createdAt: "desc" },
    });
    if (esistente) return { tipo: "esistente" as const, pagamento: esistente };
    const nuovo = await tx.payment.create({
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
        descrizione: `${descrizione} · canale ${origine}`,
        origineCanale: origine,
        condizioniSnapshot: snapshotCondizioni(cfg, origine),
      },
    });
    return { tipo: "nuovo" as const, pagamento: nuovo };
  });

  if (creato.tipo === "esistente") {
    const e = creato.pagamento;
    if (e.sessionId) {
      let s: Stripe.Checkout.Session | null = null;
      try {
        s = await stripe.checkout.sessions.retrieve(e.sessionId);
      } catch {
        s = null;
      }
      if (s && s.status === "open" && s.url && s.amount_total === importi.totaleCent) {
        return { esito: "ok", stato: 200, riutilizzato: true, paymentId: e.id, url: s.url, importoCent, commissioneCent, totaleCent: importi.totaleCent, residuoCent: residuo.residuoCent };
      }
      await prisma.payment.updateMany({ where: { id: e.id, tenantId: booking.tenantId, stato: "in_attesa" }, data: { stato: "fallito" } });
    }
    return { esito: "errore", stato: 409, messaggio: "Un pagamento è già in corso su questa prenotazione: riprova tra qualche istante" };
  }

  const nuovo = creato.pagamento;
  let sessione: Stripe.Checkout.Session;
  try {
    sessione = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      metadata: { tenantId: booking.tenantId, bookingId: booking.id, tipo },
    });
  } catch (e) {
    await prisma.payment.updateMany({ where: { id: nuovo.id, tenantId: booking.tenantId, stato: "in_attesa" }, data: { stato: "fallito" } });
    return { esito: "errore", stato: 422, messaggio: `Stripe ha rifiutato la richiesta: ${e instanceof Error ? e.message : "errore"}` };
  }
  await prisma.payment.update({ where: { id: nuovo.id, tenantId: booking.tenantId }, data: { sessionId: sessione.id } });
  return {
    esito: "ok",
    stato: 201,
    riutilizzato: false,
    paymentId: nuovo.id,
    url: sessione.url ?? "",
    importoCent,
    commissioneCent,
    totaleCent: importi.totaleCent,
    residuoCent: residuo.residuoCent,
  };
}
