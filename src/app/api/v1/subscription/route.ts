import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  MESI_PER_STAGIONE,
  TIPI,
  attivazionePagata,
  dataPartenza,
  etichetta,
  giorniResidui,
  listinoPerTenant,
  preventivo,
  quantitaAmmessa,
  statoAbbonamento,
} from "@/lib/subscriptions";
import { requireAzienda } from "@/lib/tenant";
import Stripe from "stripe";
import { z } from "zod";

// Staffa per il pagamento: appoggia sull'account Stripe di NaBoat (piattaforma).
function stripeNaBoat() {
  const key = process.env.PLATFORM_STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { typescript: true });
}

// Stato dei servizi NaBoat per l'azienda: gestionale (attivazione + manutenzione) e marketplace (fee).
export async function GET(req: Request) {
  const t = await requireAzienda(req, { ignoraAbbonamento: true });
  if ("error" in t) return t.error;

  const l = await listinoPerTenant(t.tenantId);
  const { manutenzione, attivazione } = await statoAbbonamento(t.tenantId);
  const tenant = await prisma.tenant.findUnique({
    where: { id: t.tenantId },
    select: { moduloMarketplace: true, feeNaboatPct: true },
  });
  const storico = await prisma.subscription.findMany({
    where: { tenantId: t.tenantId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return ok({
    obbligatorio: l.abbonamentoObbligatorio,
    tipi: TIPI,
    mesiPerStagione: MESI_PER_STAGIONE,
    listino: {
      attivazioneCent: l.prezzoAttivazioneCent,
      mensileCent: l.canoneMensileCent,
      stagionaleCent: l.canoneStagionaleCent,
    },
    attivazione: attivazione
      ? { id: attivazione.id, pagataAt: attivazione.paidAt, prezzoCent: attivazione.prezzoCent }
      : null,
    manutenzione: manutenzione
      ? { id: manutenzione.id, tipo: manutenzione.tipo, fineAt: manutenzione.fineAt, giorniResidui: giorniResidui(manutenzione.fineAt) }
      : null,
    // Area marketplace: separata dal gestionale. Se il modulo è spento, la fee non si applica.
    marketplace: {
      attivo: tenant?.moduloMarketplace !== false,
      feePct: tenant?.moduloMarketplace === false ? 0 : tenant?.feeNaboatPct ?? 0,
    },
    storico: storico.map((s) => ({ ...s, etichetta: etichetta(s.tipo, s.quantita) })),
    pagamentoCartaDisponibile: !!process.env.PLATFORM_STRIPE_SECRET_KEY,
  });
}

const Schema = z.object({
  tipo: z.enum(TIPI),
  quantita: z.number().int().default(1),
});

// Preventivo: mostra quanto costa prima di pagare.
export async function POST(req: Request) {
  const t = await requireAzienda(req, { ignoraAbbonamento: true });
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  if (!quantitaAmmessa(p.data.tipo, p.data.quantita)) {
    return fail(
      p.data.tipo === "attivazione"
        ? "L'attivazione si paga una volta sola"
        : p.data.tipo === "manutenzione_stagionale"
          ? "Stagioni ammesse: da 1 a 10"
          : "Mesi ammessi: da 1 a 24",
      422
    );
  }

  const l = await listinoPerTenant(t.tenantId);
  const inizio = p.data.tipo === "attivazione" ? new Date() : await dataPartenza(t.tenantId);
  const prev = preventivo(p.data.tipo, p.data.quantita, l, inizio);
  return ok({
    tipo: p.data.tipo,
    etichetta: etichetta(p.data.tipo, p.data.quantita),
    quantita: p.data.quantita,
    unitarioCent: prev.unitarioCent,
    prezzoCent: prev.prezzoCent,
    inizioAt: prev.inizioAt,
    fineAt: prev.fineAt,
  });
}

// Avvia il pagamento con carta sull'account NaBoat.
export async function PUT(req: Request) {
  const t = await requireAzienda(req, { ignoraAbbonamento: true });
  if ("error" in t) return t.error;
  if (t.role !== "owner" && t.role !== "superadmin") return fail("Riservato al proprietario", 403);

  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  if (!quantitaAmmessa(p.data.tipo, p.data.quantita)) return fail("Quantità non ammessa", 422);

  if (p.data.tipo === "attivazione") {
    const gia = await attivazionePagata(t.tenantId);
    if (gia) return fail("Attivazione già pagata", 422);
  }

  const stripe = stripeNaBoat();
  if (!stripe) return fail("Pagamento con carta non configurato: contatta NaBoat per il bonifico", 422);

  const l = await listinoPerTenant(t.tenantId);
  const inizio = p.data.tipo === "attivazione" ? new Date() : await dataPartenza(t.tenantId);
  const prev = preventivo(p.data.tipo, p.data.quantita, l, inizio);
  if (prev.prezzoCent <= 0) return fail("Voce non ancora a listino: contatta NaBoat", 422);

  const tenant = await prisma.tenant.findUnique({ where: { id: t.tenantId }, select: { nome: true } });
  const descrizione = etichetta(p.data.tipo, p.data.quantita);

  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  let sessione;
  try {
    sessione = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: prev.prezzoCent,
            product_data: { name: `NaBoat — ${descrizione}`, description: tenant?.nome ?? undefined },
          },
        },
      ],
      success_url: `${base}/abbonamento?esito=ok`,
      cancel_url: `${base}/abbonamento?esito=annullato`,
      metadata: { tenantId: t.tenantId, tipo: p.data.tipo, quantita: String(p.data.quantita) },
    });
  } catch (e) {
    return fail(`Stripe ha rifiutato la richiesta: ${e instanceof Error ? e.message : "errore"}`, 422);
  }

  const sub = await prisma.subscription.create({
    data: {
      tenantId: t.tenantId,
      tipo: p.data.tipo,
      quantita: p.data.quantita,
      prezzoCent: prev.prezzoCent,
      inizioAt: prev.inizioAt,
      fineAt: prev.fineAt,
      stato: "in_attesa",
      sessionId: sessione.id,
      metodo: "carta",
    },
  });

  return ok({ subscriptionId: sub.id, url: sessione.url, prezzoCent: prev.prezzoCent }, 201);
}

export async function DELETE(req: Request) {
  const t = await requireAzienda(req, { ignoraAbbonamento: true });
  if ("error" in t) return t.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("Parametro id obbligatorio", 422);
  const cur = await prisma.subscription.findFirst({ where: { id, tenantId: t.tenantId }, select: { id: true, stato: true } });
  if (!cur) return fail("Abbonamento non trovato", 404);
  if (cur.stato === "attivo") return fail("Non si annulla una voce attiva: contatta NaBoat", 422);
  await prisma.subscription.update({ where: { id: cur.id }, data: { stato: "annullato" } });
  return ok({ id: cur.id, stato: "annullato" });
}
