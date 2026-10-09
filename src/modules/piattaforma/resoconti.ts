import { prisma } from "@/lib/db";

// Resoconto economico dell'azienda: incassi, spese e margine.
//
// Formula del margine (AGENTS.md), applicata per singola barca e complessiva:
//   margine noleggio = prezzo del noleggio incassato
//                    − fee NaBoat
//                    − commissione del fornitore di pagamento
//                    − spese
// Chi incassa/sostiene le voci:
//   • il cliente paga prezzo + «Commissioni di servizio» (fee NaBoat + commissione fornitore);
//   • dell'importo del noleggio (importoCent, al netto dei rimborsi) l'azienda è titolare;
//   • fee NaBoat e commissione fornitore non sono ricavi dell'azienda: non vanno mai
//     contate come noleggio e vengono sottratte una sola volta;
//   • le spese sono costi dell'azienda (Expense).
// Attenzione a non fare doppie sottrazioni: un'eventuale spesa di categoria
// «commissioni» è una scelta dell'azienda e resterebbe un costo aggiuntivo distinto
// dalla commissione del fornitore; i dati storici non vengono corretti d'ufficio.
//
// Noleggio e ormeggio non si mescolano: gli incassi di ormeggio (Payment.permanenzaId)
// e le spese su barche in custodia (Boat.uso = "custodia") sono aggregati a parte.
// Gli addebiti della cauzione per danni non sono prezzo del noleggio e sono esposti
// separatamente, senza entrare nel margine.
//
// Data economica: ogni importo è attribuito al periodo con la data effettiva
// dell'incasso (paidAt). Per gli incassi storici privi di paidAt si usa createdAt,
// che è l'unica data disponibile: quei dati non vengono riscritti.

export type Periodo = { from: Date; to: Date };

export type RigaBarca = {
  boatId: string | null;
  barca: string;
  incassatoCent: number;
  rimborsatoCent: number;
  noleggioCent: number;
  feeNaboatCent: number;
  feeProviderCent: number;
  speseCent: number;
  margineCent: number;
};

export type RigaOrmeggio = {
  permanenzaId: string;
  barca: string;
  incassatoCent: number;
  rimborsatoCent: number;
  importoCent: number;
  numero: number;
};

export type Riepilogo = {
  periodo: { from: string; to: string };
  incassi: {
    pagatoCent: number;
    rimborsatoCent: number;
    noleggioCent: number;
    feeNaboatCent: number;
    feeProviderCent: number;
    incassoNettoCent: number;
    numeroIncassi: number;
  };
  // Ormeggio: incassi di un modulo separato, aggregati a parte.
  ormeggio: {
    pagatoCent: number;
    rimborsatoCent: number;
    importoCent: number;
    feeNaboatCent: number;
    numeroIncassi: number;
  };
  // Cauzione per danni: addebito distinto dal prezzo del noleggio.
  cauzioni: { addebitatoCent: number; numero: number };
  spese: {
    totaleCent: number;
    noleggioCent: number;
    ormeggioCent: number;
    numeroSpese: number;
    perCategoria: { categoria: string; totaleCent: number }[];
  };
  margineCent: number;
  margineOrmeggioCent: number;
  perBarca: RigaBarca[];
  perOrmeggio: RigaOrmeggio[];
  perCanale: { canale: string; noleggioCent: number; feeNaboatCent: number; numero: number }[];
  perMetodo: { metodo: string; totaleCent: number }[];
};

export function parsePeriodo(url: URL): Periodo {
  const oggi = new Date();
  const inizioDefault = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), 1));
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : inizioDefault;
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : oggi;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new Error("Periodo non valido");
  }
  return { from, to };
}

export async function riepilogo(tenantId: string, periodo: Periodo): Promise<Riepilogo> {
  const [payments, expenses, boats] = await Promise.all([
    prisma.payment.findMany({
      where: {
        tenantId,
        // Data economica effettiva: paidAt; fallback createdAt solo per lo storico.
        OR: [
          { paidAt: { gte: periodo.from, lte: periodo.to } },
          { paidAt: null, createdAt: { gte: periodo.from, lte: periodo.to } },
        ],
        stato: { in: ["pagato", "rimborsato_parziale", "rimborsato"] },
      },
      select: {
        id: true,
        importoCent: true,
        feeNaboatCent: true,
        feeProviderCent: true,
        totaleCent: true,
        rimborsoCent: true,
        stato: true,
        metodo: true,
        provider: true,
        permanenzaId: true,
        paymentIntentId: true,
        booking: { select: { boatId: true, origineCanale: true, cauzioneIntentId: true, boat: { select: { nome: true } } } },
        permanenza: { select: { id: true, boat: { select: { nome: true } } } },
      },
      take: 10000,
    }),
    prisma.expense.findMany({
      where: { tenantId, data: { gte: periodo.from, lte: periodo.to } },
      select: { id: true, boatId: true, categoria: true, importoCent: true, boat: { select: { uso: true } } },
      take: 10000,
    }),
    prisma.boat.findMany({ where: { tenantId }, select: { id: true, nome: true } }),
  ]);

  // Cauzione addebitata: l'incasso porta lo stesso paymentIntentId dell'autorizzazione.
  const eCauzione = (p: (typeof payments)[number]) =>
    !!p.booking?.cauzioneIntentId && !!p.paymentIntentId && p.paymentIntentId === p.booking.cauzioneIntentId;

  const noleggio = payments.filter((p) => !p.permanenzaId && !eCauzione(p));
  const ormeggio = payments.filter((p) => !!p.permanenzaId && !eCauzione(p));
  const cauzioni = payments.filter(eCauzione);

  const somma = (lista: typeof payments, campo: (p: (typeof payments)[number]) => number) => lista.reduce((s, p) => s + campo(p), 0);

  const pagatoCent = somma(noleggio, (p) => p.totaleCent);
  const rimborsatoCent = somma(noleggio, (p) => p.rimborsoCent);
  const noleggioCent = somma(noleggio, (p) => Math.max(0, p.importoCent - p.rimborsoCent));
  const feeNaboatCent = somma(noleggio, (p) => p.feeNaboatCent);
  const feeProviderCent = somma(noleggio, (p) => p.feeProviderCent);

  const ormeggioPagatoCent = somma(ormeggio, (p) => p.totaleCent);
  const ormeggioRimborsatoCent = somma(ormeggio, (p) => p.rimborsoCent);
  const ormeggioImportoCent = somma(ormeggio, (p) => Math.max(0, p.importoCent - p.rimborsoCent));
  const ormeggioFeeNaboatCent = somma(ormeggio, (p) => p.feeNaboatCent);
  const ormeggioFeeProviderCent = somma(ormeggio, (p) => p.feeProviderCent);

  // Spese: quelle su barche in custodia sono dell'ormeggio, le altre del noleggio.
  const speseNoleggio = expenses.filter((e) => e.boat?.uso !== "custodia");
  const speseOrmeggio = expenses.filter((e) => e.boat?.uso === "custodia");
  const speseTotaleCent = expenses.reduce((s, e) => s + e.importoCent, 0);
  const speseNoleggioCent = speseNoleggio.reduce((s, e) => s + e.importoCent, 0);
  const speseOrmeggioCent = speseOrmeggio.reduce((s, e) => s + e.importoCent, 0);
  const categorie = new Map<string, number>();
  for (const e of expenses) categorie.set(e.categoria, (categorie.get(e.categoria) ?? 0) + e.importoCent);

  const nomeBarca = new Map(boats.map((b) => [b.id, b.nome]));
  const perBarcaMap = new Map<string, RigaBarca>();
  const riga = (boatId: string | null): RigaBarca => {
    const chiave = boatId ?? "__generale__";
    if (!perBarcaMap.has(chiave)) {
      perBarcaMap.set(chiave, {
        boatId,
        barca: boatId ? nomeBarca.get(boatId) ?? "Barca rimossa" : "Generale (senza barca)",
        incassatoCent: 0,
        rimborsatoCent: 0,
        noleggioCent: 0,
        feeNaboatCent: 0,
        feeProviderCent: 0,
        speseCent: 0,
        margineCent: 0,
      });
    }
    return perBarcaMap.get(chiave)!;
  };

  for (const p of noleggio) {
    const r = riga(p.booking?.boatId ?? null);
    r.incassatoCent += p.totaleCent;
    r.rimborsatoCent += p.rimborsoCent;
    r.noleggioCent += Math.max(0, p.importoCent - p.rimborsoCent);
    r.feeNaboatCent += p.feeNaboatCent;
    r.feeProviderCent += p.feeProviderCent;
  }
  for (const e of speseNoleggio) {
    const r = riga(e.boatId);
    r.speseCent += e.importoCent;
  }
  for (const r of perBarcaMap.values()) {
    r.margineCent = r.noleggioCent - r.feeNaboatCent - r.feeProviderCent - r.speseCent;
  }
  const perBarca = [...perBarcaMap.values()].sort((a, b) => b.margineCent - a.margineCent);

  // Dettaglio per permanenza di ormeggio (il "conto" dell'azienda).
  const ormeggioMap = new Map<string, RigaOrmeggio>();
  for (const p of ormeggio) {
    const id = p.permanenzaId!;
    if (!ormeggioMap.has(id)) {
      ormeggioMap.set(id, {
        permanenzaId: id,
        barca: p.permanenza?.boat?.nome ?? "Barca rimossa",
        incassatoCent: 0,
        rimborsatoCent: 0,
        importoCent: 0,
        numero: 0,
      });
    }
    const r = ormeggioMap.get(id)!;
    r.incassatoCent += p.totaleCent;
    r.rimborsatoCent += p.rimborsoCent;
    r.importoCent += Math.max(0, p.importoCent - p.rimborsoCent);
    r.numero += 1;
  }
  const perOrmeggio = [...ormeggioMap.values()].sort((a, b) => b.importoCent - a.importoCent);

  const canali = new Map<string, { canale: string; noleggioCent: number; feeNaboatCent: number; numero: number }>();
  for (const p of noleggio) {
    const canale = p.booking?.origineCanale === "naboat" ? "naboat" : "diretto";
    if (!canali.has(canale)) canali.set(canale, { canale, noleggioCent: 0, feeNaboatCent: 0, numero: 0 });
    const c = canali.get(canale)!;
    c.noleggioCent += Math.max(0, p.importoCent - p.rimborsoCent);
    c.feeNaboatCent += p.feeNaboatCent;
    c.numero += 1;
  }

  const metodi = new Map<string, number>();
  for (const p of noleggio) {
    const m = p.provider === "manuale" ? p.metodo ?? "manuale" : "carta";
    metodi.set(m, (metodi.get(m) ?? 0) + p.totaleCent);
  }

  return {
    periodo: { from: periodo.from.toISOString(), to: periodo.to.toISOString() },
    incassi: {
      pagatoCent,
      rimborsatoCent,
      noleggioCent,
      feeNaboatCent,
      feeProviderCent,
      incassoNettoCent: noleggioCent - feeNaboatCent - feeProviderCent,
      numeroIncassi: noleggio.length,
    },
    ormeggio: {
      pagatoCent: ormeggioPagatoCent,
      rimborsatoCent: ormeggioRimborsatoCent,
      importoCent: ormeggioImportoCent,
      feeNaboatCent: ormeggioFeeNaboatCent,
      numeroIncassi: ormeggio.length,
    },
    cauzioni: {
      addebitatoCent: cauzioni.reduce((s, p) => s + p.importoCent, 0),
      numero: cauzioni.length,
    },
    spese: {
      totaleCent: speseTotaleCent,
      noleggioCent: speseNoleggioCent,
      ormeggioCent: speseOrmeggioCent,
      numeroSpese: expenses.length,
      perCategoria: [...categorie.entries()].map(([categoria, totaleCent]) => ({ categoria, totaleCent })).sort((a, b) => b.totaleCent - a.totaleCent),
    },
    margineCent: noleggioCent - feeNaboatCent - feeProviderCent - speseNoleggioCent,
    margineOrmeggioCent: ormeggioImportoCent - ormeggioFeeNaboatCent - ormeggioFeeProviderCent - speseOrmeggioCent,
    perBarca,
    perOrmeggio,
    perCanale: [...canali.values()].sort((a, b) => b.noleggioCent - a.noleggioCent),
    perMetodo: [...metodi.entries()].map(([metodo, totaleCent]) => ({ metodo, totaleCent })).sort((a, b) => b.totaleCent - a.totaleCent),
  };
}

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const num = (cent: number) => (cent / 100).toFixed(2).replace(".", ",");
const dataIt = (iso: string) => new Date(iso).toLocaleDateString("it-IT");

export function riepilogoCsv(r: Riepilogo): string {
  const rows: string[] = [];
  rows.push(["Periodo", `${dataIt(r.periodo.from)} - ${dataIt(r.periodo.to)}`].map(esc).join(";"));
  rows.push("");
  rows.push(["INCASSI NOLEGGIO", "Importo (EUR)"].map(esc).join(";"));
  rows.push(["Incassato dal cliente (comprese commissioni)", num(r.incassi.pagatoCent)].map(esc).join(";"));
  rows.push(["Rimborsato", num(r.incassi.rimborsatoCent)].map(esc).join(";"));
  rows.push(["Prezzo del noleggio", num(r.incassi.noleggioCent)].map(esc).join(";"));
  rows.push(["Fee NaBoat", num(r.incassi.feeNaboatCent)].map(esc).join(";"));
  rows.push(["Commissione fornitore pagamento", num(r.incassi.feeProviderCent)].map(esc).join(";"));
  rows.push(["Numero incassi", String(r.incassi.numeroIncassi)].map(esc).join(";"));
  rows.push("");
  rows.push(["INCASSI ORMEGGIO", "Importo (EUR)"].map(esc).join(";"));
  rows.push(["Incassato dal cliente", num(r.ormeggio.pagatoCent)].map(esc).join(";"));
  rows.push(["Rimborsato", num(r.ormeggio.rimborsatoCent)].map(esc).join(";"));
  rows.push(["Importo ormeggio", num(r.ormeggio.importoCent)].map(esc).join(";"));
  rows.push(["Numero incassi", String(r.ormeggio.numeroIncassi)].map(esc).join(";"));
  rows.push("");
  rows.push(["CAUZIONI ADDEBITATE (danni, fuori dal margine)", num(r.cauzioni.addebitatoCent)].map(esc).join(";"));
  rows.push("");
  rows.push(["SPESE", "Importo (EUR)"].map(esc).join(";"));
  for (const c of r.spese.perCategoria) rows.push([`Spese ${c.categoria}`, num(c.totaleCent)].map(esc).join(";"));
  rows.push(["Totale spese", num(r.spese.totaleCent)].map(esc).join(";"));
  rows.push(["Spese noleggio", num(r.spese.noleggioCent)].map(esc).join(";"));
  rows.push(["Spese ormeggio", num(r.spese.ormeggioCent)].map(esc).join(";"));
  rows.push(["Numero spese", String(r.spese.numeroSpese)].map(esc).join(";"));
  rows.push("");
  rows.push(["MARGINE NOLEGGIO", num(r.margineCent)].map(esc).join(";"));
  rows.push(["MARGINE ORMEGGIO", num(r.margineOrmeggioCent)].map(esc).join(";"));
  rows.push("");
  rows.push(["PER BARCA", "Incassato EUR", "Noleggio EUR", "Rimborsato EUR", "Fee NaBoat EUR", "Commissioni EUR", "Spese EUR", "Margine EUR"].map(esc).join(";"));
  for (const b of r.perBarca) {
    rows.push([b.barca, num(b.incassatoCent), num(b.noleggioCent), num(b.rimborsatoCent), num(b.feeNaboatCent), num(b.feeProviderCent), num(b.speseCent), num(b.margineCent)].map(esc).join(";"));
  }
  rows.push("");
  rows.push(["PER PERMANENZA ORMEGGIO", "Incassato EUR", "Importo EUR", "Rimborsato EUR", "Numero"].map(esc).join(";"));
  for (const o of r.perOrmeggio) rows.push([o.barca, num(o.incassatoCent), num(o.importoCent), num(o.rimborsatoCent), String(o.numero)].map(esc).join(";"));
  rows.push("");
  rows.push(["PER CANALE", "Noleggio EUR", "Fee NaBoat EUR", "Numero"].map(esc).join(";"));
  for (const c of r.perCanale) rows.push([c.canale, num(c.noleggioCent), num(c.feeNaboatCent), String(c.numero)].map(esc).join(";"));
  rows.push("");
  rows.push(["INCASSI PER METODO", "Totale EUR"].map(esc).join(";"));
  for (const m of r.perMetodo) rows.push([m.metodo, num(m.totaleCent)].map(esc).join(";"));
  return rows.join("\r\n");
}
