import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/payments";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Impostazioni pagamenti dell'azienda. Solo il proprietario (RFQ D4: l'azienda si attiva da sola,
// NaBoat può disattivare da /admin). Le chiavi segrete non vengono mai restituite.
// La fee NaBoat e il modulo Marketplace NON sono modificabili qui: li imposta NaBoat da /admin.
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  if (t.role !== "owner" && t.role !== "superadmin") return fail("Riservato al proprietario", 403);
  const s = await prisma.tenant.findUnique({
    where: { id: t.tenantId },
    select: {
      pagamentiAttivi: true,
      pagamentiBloccatiNaBoat: true,
      stripeAttivo: true,
      stripeSecretEnc: true,
      stripeWebhookEnc: true,
      stripePublicKey: true,
      paypalAttivo: true,
      moduloMarketplace: true,
      feeNaboatPct: true,
      feeProviderPct: true,
      feeProviderFixedCent: true,
      accontoPct: true,
      rimborsoPct: true,
      rimborsoOreMinime: true,
    },
  });
  if (!s) return fail("Azienda non trovata", 404);
  const marketplaceAttivo = s.moduloMarketplace !== false;
  return ok({
    pagamentiAttivi: s.pagamentiAttivi,
    pagamentiBloccatiNaBoat: s.pagamentiBloccatiNaBoat,
    stripeAttivo: s.stripeAttivo,
    stripeConfigurato: !!s.stripeSecretEnc,
    webhookConfigurato: !!s.stripeWebhookEnc,
    stripePublicKey: s.stripePublicKey,
    paypalAttivo: s.paypalAttivo,
    moduloMarketplace: marketplaceAttivo,
    feeNaboatPct: marketplaceAttivo ? s.feeNaboatPct : 0,
    feeProviderPct: s.feeProviderPct,
    feeProviderFixedCent: s.feeProviderFixedCent,
    accontoPct: s.accontoPct,
    rimborsoPct: s.rimborsoPct,
    rimborsoOreMinime: s.rimborsoOreMinime,
  });
}

// Schema rigido: i campi non previsti (es. feeNaboatPct, che decide solo NaBoat) vengono rifiutati.
const Schema = z
  .object({
    pagamentiAttivi: z.boolean().optional(),
    stripeAttivo: z.boolean().optional(),
    paypalAttivo: z.boolean().optional(),
    stripeSecretKey: z.string().min(10).max(400).optional(),
    stripeWebhookSecret: z.string().min(10).max(400).optional(),
    stripePublicKey: z.string().max(400).optional().nullable(),
    feeProviderPct: z.number().min(0).max(20).optional(),
    feeProviderFixedCent: z.number().int().min(0).max(5000).optional(),
    accontoPct: z.number().min(0).max(100).optional(),
    rimborsoPct: z.number().min(0).max(100).optional(),
    rimborsoOreMinime: z.number().int().min(0).max(720).optional(),
  })
  .strict();

export async function PATCH(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  if (t.role !== "owner" && t.role !== "superadmin") return fail("Riservato al proprietario", 403);
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const v = p.data;

  if (v.pagamentiAttivi) {
    const cur = await prisma.tenant.findUnique({
      where: { id: t.tenantId },
      select: { stripeSecretEnc: true, stripeAttivo: true, paypalAttivo: true },
    });
    const haStripe = v.stripeSecretKey ? true : !!cur?.stripeSecretEnc;
    const stripeOk = v.stripeAttivo ?? cur?.stripeAttivo ?? false;
    const paypalOk = v.paypalAttivo ?? cur?.paypalAttivo ?? false;
    if (!(stripeOk && haStripe) && !paypalOk) {
      return fail("Per attivare i pagamenti serve almeno un fornitore configurato (chiave Stripe oppure PayPal)", 422);
    }
  }

  const data: Record<string, unknown> = { ...v };
  delete data.stripeSecretKey;
  delete data.stripeWebhookSecret;
  if (v.stripeSecretKey) data.stripeSecretEnc = encryptSecret(v.stripeSecretKey.trim());
  if (v.stripeWebhookSecret) data.stripeWebhookEnc = encryptSecret(v.stripeWebhookSecret.trim());

  const updated = await prisma.tenant.update({ where: { id: t.tenantId }, data: data as never });
  await prisma.auditLog.create({
    data: {
      tenantId: t.tenantId,
      actorId: t.userId,
      azione: "pagamenti.impostazioni",
      entita: "Tenant",
      entitaId: t.tenantId,
    },
  });
  return ok({
    pagamentiAttivi: updated.pagamentiAttivi,
    stripeAttivo: updated.stripeAttivo,
    paypalAttivo: updated.paypalAttivo,
    feeNaboatPct: updated.feeNaboatPct,
    accontoPct: updated.accontoPct,
  });
}
