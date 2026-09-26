import crypto from "crypto";
import Stripe from "stripe";
import { prisma } from "@/lib/db";

// --- Cifratura delle chiavi di pagamento (a riposo, nel database) ---
// Le chiavi non vengono mai salvate in chiaro e non vengono mai restituite dalle API.
const ALGO = "aes-256-gcm";

function cryptoKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET mancante o troppo corto (>=32 char)");
  return crypto.createHash("sha256").update(`${secret}:pagamenti`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, cryptoKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Chiave cifrata non valida");
  const decipher = crypto.createDecipheriv(ALGO, cryptoKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

// --- Stato dei pagamenti per un'azienda ---
export type PaymentConfig = {
  tenantId: string;
  attivi: boolean;
  stripePronto: boolean;
  paypalAttivo: boolean;
  stripePublicKey: string | null;
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  feeNaboatPct: number;
  feeProviderPct: number;
  feeProviderFixedCent: number;
  accontoPct: number;
  rimborsoPct: number;
  rimborsoOreMinime: number;
  marketplaceAttivo: boolean;
};

// Ritorna la configurazione solo se i pagamenti sono effettivamente utilizzabili.
export async function paymentConfig(tenantId: string): Promise<PaymentConfig | null> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      status: true,
      pagamentiAttivi: true,
      pagamentiBloccatiNaBoat: true,
      stripeAttivo: true,
      stripeSecretEnc: true,
      stripeWebhookEnc: true,
      stripePublicKey: true,
      paypalAttivo: true,
      feeNaboatPct: true,
      feeProviderPct: true,
      feeProviderFixedCent: true,
      accontoPct: true,
      rimborsoPct: true,
      rimborsoOreMinime: true,
      moduloMarketplace: true,
    },
  });
  if (!t) return null;
  const attivi = t.status === "active" && t.pagamentiAttivi && !t.pagamentiBloccatiNaBoat;
  const stripePronto = attivi && t.stripeAttivo && !!t.stripeSecretEnc;
  const marketplaceAttivo = t.moduloMarketplace !== false;
  return {
    tenantId: t.id,
    attivi,
    stripePronto,
    paypalAttivo: attivi && t.paypalAttivo,
    stripePublicKey: t.stripePublicKey,
    stripeSecretKey: t.stripeSecretEnc ? decryptSecret(t.stripeSecretEnc) : null,
    stripeWebhookSecret: t.stripeWebhookEnc ? decryptSecret(t.stripeWebhookEnc) : null,
    // Con il modulo marketplace spento la fee NaBoat non si applica.
    feeNaboatPct: marketplaceAttivo ? t.feeNaboatPct : 0,
    feeProviderPct: t.feeProviderPct,
    feeProviderFixedCent: t.feeProviderFixedCent,
    accontoPct: t.accontoPct,
    rimborsoPct: t.rimborsoPct,
    rimborsoOreMinime: t.rimborsoOreMinime,
    marketplaceAttivo,
  };
}

export function stripeClient(secretKey: string) {
  return new Stripe(secretKey, { typescript: true });
}

// --- Calcolo importi (RFQ D7: la fee è una voce unica addebitata al cliente) ---
export type Importi = {
  importoCent: number;
  feeNaboatCent: number;
  feeProviderCent: number;
  totaleCent: number;
};

export function calcolaImporti(
  importoCent: number,
  feeNaboatPct: number,
  feeProviderPct: number,
  feeProviderFixedCent: number,
  feeApplicabile: boolean
): Importi {
  if (!Number.isInteger(importoCent) || importoCent <= 0) throw new Error("Importo non valido");
  const feeNaboatCent = feeApplicabile ? Math.round((importoCent * feeNaboatPct) / 100) : 0;
  const feeProviderCent = Math.round((importoCent * feeProviderPct) / 100) + feeProviderFixedCent;
  return { importoCent, feeNaboatCent, feeProviderCent, totaleCent: importoCent + feeNaboatCent + feeProviderCent };
}

// RFQ D8: rimborso parziale, ammesso solo fino a N ore prima dell'uscita.
// La fee NaBoat non viene mai rimborsata: si rimborsa una percentuale del solo prezzo del noleggio.
export function calcolaRimborso(importoCent: number, rimborsoPct: number): number {
  const percentuale = Math.min(100, Math.max(0, rimborsoPct));
  return Math.min(importoCent, Math.round((importoCent * percentuale) / 100));
}

export function rimborsoAmmesso(startAt: Date, rimborsoOreMinime: number, adesso = new Date()): boolean {
  const limite = new Date(startAt.getTime() - rimborsoOreMinime * 3600 * 1000);
  return adesso < limite;
}

export function parseImportoEuro(input: string | number): number | null {
  const testo = typeof input === "number" ? input.toFixed(2) : String(input).trim().replace(",", ".").replace(/[^\d.]/g, "");
  if (!testo) return null;
  const valore = Number(testo);
  if (!Number.isFinite(valore) || valore <= 0 || valore > 1000000) return null;
  return Math.round(valore * 100);
}

export function formattaEuro(cent: number): string {
  return (cent / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}
