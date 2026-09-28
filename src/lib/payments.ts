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

// Limite massimo degli importi gestiti dal progetto: 1.000.000 € in centesimi.
export const IMPORTO_MASSIMO_CENT = 100000000;
const LIMITE_IMPORTO_EURO = IMPORTO_MASSIMO_CENT / 100;

// Convenzione: locale italiano. Formati ammessi: `300`, `300,50`, `300.50`,
// `1.234,56`, `1,234.56`. Con una sola occorrenza il separatore è decimale se ha
// 1-2 cifre, altrimenti è delle migliaia (`1.234` = 1234); con entrambi i separatori
// l'ultimo è decimale e l'altro è delle migliaia. Al massimo 2 decimali.
// Segni, lettere, spazi e testo vengono rifiutati (null). Ritorna centesimi interi.
export function parseImportoEuro(input: string | number): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input <= 0 || input > LIMITE_IMPORTO_EURO) return null;
    const cent = Math.round(input * 100);
    if (Math.abs(input * 100 - cent) > 1e-6) return null; // più di 2 decimali
    return cent;
  }
  if (typeof input !== "string") return null;

  const testo = input.trim();
  // Solo cifre e separatori , . : niente segni, lettere, spazi o altro testo.
  if (!/^\d+(?:[.,]\d+)*$/.test(testo)) return null;

  let intera = "";
  let decimale = "";
  if (testo.includes(",") && testo.includes(".")) {
    // Un separatore è decimale (l'ultimo), l'altro è delle migliaia.
    const sepDec = testo.lastIndexOf(",") > testo.lastIndexOf(".") ? "," : ".";
    const sepMig = sepDec === "," ? "." : ",";
    const [prima, ...resto] = testo.split(sepDec);
    if (resto.length !== 1) return null;
    // Le migliaia devono essere raggruppate a tre cifre (es. 1.234,56).
    if (!new RegExp(`^\\d{1,3}(?:\\${sepMig}\\d{3})*$`).test(prima)) return null;
    intera = prima.split(sepMig).join("");
    decimale = resto[0];
  } else {
    const sep = testo.includes(",") ? "," : testo.includes(".") ? "." : null;
    if (!sep) {
      intera = testo;
    } else {
      const parti = testo.split(sep);
      if (parti.length > 2) {
        // Più occorrenze dello stesso separatore: sono delle migliaia (es. 1.234.567).
        if (!new RegExp(`^\\d{1,3}(?:\\${sep}\\d{3})+$`).test(testo)) return null;
        intera = parti.join("");
      } else if (parti[1].length === 3) {
        // Una sola occorrenza con 3 cifre: separatore delle migliaia (1.234 = 1234).
        intera = parti[0] + parti[1];
      } else {
        intera = parti[0];
        decimale = parti[1];
      }
    }
  }

  if (decimale.length > 2) return null;
  if (!intera || !/^\d+$/.test(intera)) return null;
  const cent = Number(intera) * 100 + Number(decimale.padEnd(2, "0"));
  if (!Number.isSafeInteger(cent) || cent <= 0 || cent > IMPORTO_MASSIMO_CENT) return null;
  return cent;
}

export function formattaEuro(cent: number): string {
  return (cent / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

// --- Residuo del prezzo e snapshot delle condizioni ---

export type PagamentoPerResiduo = {
  id?: string;
  stato: string;
  provider?: string | null;
  tipo?: string | null;
  importoCent: number;
  feeNaboatCent?: number | null;
  feeProviderCent?: number | null;
  totaleCent?: number | null;
  rimborsoCent?: number | null;
  sessionId?: string | null;
  paymentIntentId?: string | null;
  createdAt?: Date | string | null;
};

export type ResiduoPrezzo = {
  prezzoCent: number;
  capitaleIncassatoCent: number;
  rimborsatoCent: number;
  commissioniIncassateCent: number;
  cauzioneIncassataCent: number;
  residuoCent: number;
  inAttesaCent: number;
  intentiPendenti: PagamentoPerResiduo[];
};

const STATI_INCASSATI = ["pagato", "rimborsato_parziale", "rimborsato"];

// Residuo del prezzo: prezzo pattuito meno il capitale effettivamente incassato
// (acconto/saldo/totale). I rimborsi riaprono il residuo per la parte rimborsata.
// Gli incassi della cauzione non riducono il prezzo del noleggio: sono esposti a parte.
// Gli intenti in attesa sono riportati separatamente per poterli riusare o annullare.
export function calcolaResiduoPrezzo(
  prezzoCent: number,
  pagamenti: PagamentoPerResiduo[],
  opts: { cauzioneIntentId?: string | null } = {}
): ResiduoPrezzo {
  let capitale = 0;
  let rimborsato = 0;
  let commissioni = 0;
  let cauzione = 0;

  for (const p of pagamenti) {
    if (!STATI_INCASSATI.includes(p.stato)) continue;
    const importo = Math.max(0, p.importoCent ?? 0);
    const rim = Math.max(0, Math.min(p.rimborsoCent ?? 0, importo));
    if (opts.cauzioneIntentId && p.paymentIntentId === opts.cauzioneIntentId) {
      cauzione += importo;
      continue;
    }
    capitale += importo - rim;
    rimborsato += p.rimborsoCent ?? 0;
    commissioni += Math.max(0, p.feeNaboatCent ?? 0) + Math.max(0, p.feeProviderCent ?? 0);
  }

  const intentiPendenti = pagamenti.filter((p) => p.stato === "in_attesa");
  const inAttesa = intentiPendenti.reduce((s, p) => s + Math.max(0, p.totaleCent ?? p.importoCent ?? 0), 0);
  const prezzo = Math.max(0, prezzoCent ?? 0);
  return {
    prezzoCent: prezzo,
    capitaleIncassatoCent: Math.max(0, capitale),
    rimborsatoCent: rimborsato,
    commissioniIncassateCent: commissioni,
    cauzioneIncassataCent: cauzione,
    residuoCent: Math.max(0, prezzo - capitale),
    inAttesaCent: inAttesa,
    intentiPendenti,
  };
}

// La fee NaBoat matura solo se l'opportunità arriva dal canale NaBoat e il modulo
// Marketplace è attivo per l'azienda (RFQ D1/D3). Unica fonte della verità.
export function feeNaBoatApplicabile(origineCanale: string | null | undefined, cfg: PaymentConfig | null): boolean {
  return !!cfg?.marketplaceAttivo && origineCanale === "naboat";
}

export type CondizioniSnapshot = {
  origineCanale: string;
  feeNaboatPct: number;
  feeProviderPct: number;
  feeProviderFixedCent: number;
  accontoPct: number;
  marketplaceAttivo: boolean;
  registratoAt: string;
};

// Congela le condizioni applicate all'incasso: cambi successivi non riscrivono lo storico.
export function snapshotCondizioni(cfg: PaymentConfig | null, origineCanale: string): CondizioniSnapshot {
  return {
    origineCanale,
    feeNaboatPct: cfg?.feeNaboatPct ?? 0,
    feeProviderPct: cfg?.feeProviderPct ?? 0,
    feeProviderFixedCent: cfg?.feeProviderFixedCent ?? 0,
    accontoPct: cfg?.accontoPct ?? 0,
    marketplaceAttivo: cfg?.marketplaceAttivo ?? false,
    registratoAt: new Date().toISOString(),
  };
}

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
      await prisma.payment.updateMany({ where: { id: p.id, stato: "in_attesa" }, data: { stato: "fallito" } });
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
      await prisma.payment.updateMany({ where: { id: p.id, stato: "in_attesa" }, data: { stato: "fallito" } });
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
    await prisma.payment.updateMany({ where: { id: p.id, stato: "in_attesa" }, data: { stato: "fallito" } });
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
      await prisma.payment.updateMany({ where: { id: e.id, stato: "in_attesa" }, data: { stato: "fallito" } });
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
    await prisma.payment.updateMany({ where: { id: nuovo.id, stato: "in_attesa" }, data: { stato: "fallito" } });
    return { esito: "errore", stato: 422, messaggio: `Stripe ha rifiutato la richiesta: ${e instanceof Error ? e.message : "errore"}` };
  }
  await prisma.payment.update({ where: { id: nuovo.id }, data: { sessionId: sessione.id } });
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
