import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { calcolaResiduoPrezzo, paymentConfig, stripeClient } from "@/lib/payments";

// Pagamento online del corrispettivo di permanenza: lo paga il proprietario dal link riservato.
// L'incasso va all'ormeggiatore; nessuna fee NaBoat sul modulo ormeggio.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = await prisma.contrattoOrmeggio.findUnique({
    where: { token },
    include: { permanenza: { include: { boat: true, posto: true, addebiti: true, payments: true } } },
  });
  if (!c) return fail("Link non valido", 404);
  const p = c.permanenza;
  // Ciclo di vita del token: scadenza esplicita e stato della risorsa.
  if (c.tokenExpires && c.tokenExpires < new Date()) return fail("Link scaduto: chiedi all'ormeggiatore un nuovo link", 410);
  const tenant = await prisma.tenant.findUnique({ where: { id: p.tenantId }, select: { status: true } });
  if (tenant?.status !== "active") return fail("Pagamento non disponibile per questa azienda", 403);
  if (p.stato !== "attiva") return fail("Permanenza non attiva: pagamento non consentito", 409);

  const cfg = await paymentConfig(p.tenantId);
  if (!cfg?.stripePronto || !cfg.stripeSecretKey) {
    return fail("Pagamento online non disponibile: contatta l'ormeggiatore per il pagamento", 422);
  }

  // Il corrispettivo iniziale NON è un fallback: si incassa solo il residuo effettivo.
  const totale = p.addebiti.reduce((s, a) => s + a.importoCent, 0);
  const residuo = calcolaResiduoPrezzo(totale, p.payments);
  if (residuo.residuoCent <= 0) return fail("Il corrispettivo risulta già saldato", 422);
  const importoCent = residuo.residuoCent;

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
            unit_amount: importoCent,
            product_data: { name: `Permanenza posto ${p.posto.codice} — ${p.boat.nome}` },
          },
        },
      ],
      success_url: `${base}/contratto-ormeggio/${token}?esito=ok`,
      cancel_url: `${base}/contratto-ormeggio/${token}?esito=annullato`,
      metadata: { tenantId: p.tenantId, permanenzaId: p.id, tipo: "ormeggio_permanenza" },
    });
  } catch (e) {
    return fail(`Stripe ha rifiutato la richiesta: ${e instanceof Error ? e.message : "errore"}`, 422);
  }

  await prisma.payment.create({
    data: {
      tenantId: p.tenantId,
      permanenzaId: p.id,
      provider: "stripe",
      tipo: "totale",
      importoCent,
      totaleCent: importoCent,
      stato: "in_attesa",
      metodo: "carta",
      sessionId: session.id,
      descrizione: `Permanenza posto ${p.posto.codice}`,
    },
  });
  return ok({ url: session.url, importoCent }, 201);
}
