import { prisma } from "@/lib/db";

// Resoconto economico dell'azienda: incassi, spese e margine.
// Definizione del margine: prezzo del noleggio incassato
//   − fee NaBoat (dovuta) − commissione del fornitore di pagamento (trattenuta) − spese registrate.

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
  spese: { totaleCent: number; numeroSpese: number; perCategoria: { categoria: string; totaleCent: number }[] };
  margineCent: number;
  perBarca: RigaBarca[];
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
      where: { tenantId, createdAt: { gte: periodo.from, lte: periodo.to } },
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
        bookingId: true,
        booking: { select: { boatId: true, origineCanale: true, boat: { select: { nome: true } } } },
      },
      take: 10000,
    }),
    prisma.expense.findMany({
      where: { tenantId, data: { gte: periodo.from, lte: periodo.to } },
      select: { id: true, boatId: true, categoria: true, importoCent: true },
      take: 10000,
    }),
    prisma.boat.findMany({ where: { tenantId }, select: { id: true, nome: true } }),
  ]);

  const incassati = payments.filter((p) => p.stato === "pagato" || p.stato === "rimborsato_parziale" || p.stato === "rimborsato");
  const pagatoCent = incassati.reduce((s, p) => s + p.totaleCent, 0);
  const rimborsatoCent = incassati.reduce((s, p) => s + p.rimborsoCent, 0);
  const noleggioCent = incassati.reduce((s, p) => s + Math.max(0, p.importoCent - p.rimborsoCent), 0);
  const feeNaboatCent = incassati.reduce((s, p) => s + p.feeNaboatCent, 0);
  const feeProviderCent = incassati.reduce((s, p) => s + p.feeProviderCent, 0);

  const speseTotaleCent = expenses.reduce((s, e) => s + e.importoCent, 0);
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

  for (const p of incassati) {
    const r = riga(p.booking?.boatId ?? null);
    r.incassatoCent += p.totaleCent;
    r.rimborsatoCent += p.rimborsoCent;
    r.noleggioCent += Math.max(0, p.importoCent - p.rimborsoCent);
    r.feeNaboatCent += p.feeNaboatCent;
    r.feeProviderCent += p.feeProviderCent;
  }
  for (const e of expenses) {
    const r = riga(e.boatId);
    r.speseCent += e.importoCent;
  }
  for (const r of perBarcaMap.values()) {
    r.margineCent = r.noleggioCent - r.feeNaboatCent - r.feeProviderCent - r.speseCent;
  }
  const perBarca = [...perBarcaMap.values()].sort((a, b) => b.margineCent - a.margineCent);

  const canali = new Map<string, { canale: string; noleggioCent: number; feeNaboatCent: number; numero: number }>();
  for (const p of incassati) {
    const canale = p.booking?.origineCanale === "naboat" ? "naboat" : "diretto";
    if (!canali.has(canale)) canali.set(canale, { canale, noleggioCent: 0, feeNaboatCent: 0, numero: 0 });
    const c = canali.get(canale)!;
    c.noleggioCent += Math.max(0, p.importoCent - p.rimborsoCent);
    c.feeNaboatCent += p.feeNaboatCent;
    c.numero += 1;
  }

  const metodi = new Map<string, number>();
  for (const p of incassati) {
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
      numeroIncassi: incassati.length,
    },
    spese: {
      totaleCent: speseTotaleCent,
      numeroSpese: expenses.length,
      perCategoria: [...categorie.entries()].map(([categoria, totaleCent]) => ({ categoria, totaleCent })).sort((a, b) => b.totaleCent - a.totaleCent),
    },
    margineCent: noleggioCent - feeNaboatCent - feeProviderCent - speseTotaleCent,
    perBarca,
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
  rows.push(["INCASSI", "Importo (EUR)"].map(esc).join(";"));
  rows.push(["Incassato dal cliente (comprese commissioni)", num(r.incassi.pagatoCent)].map(esc).join(";"));
  rows.push(["Rimborsato", num(r.incassi.rimborsatoCent)].map(esc).join(";"));
  rows.push(["Prezzo del noleggio", num(r.incassi.noleggioCent)].map(esc).join(";"));
  rows.push(["Fee NaBoat", num(r.incassi.feeNaboatCent)].map(esc).join(";"));
  rows.push(["Commissione fornitore pagamento", num(r.incassi.feeProviderCent)].map(esc).join(";"));
  rows.push(["Numero incassi", String(r.incassi.numeroIncassi)].map(esc).join(";"));
  rows.push("");
  rows.push(["SPESE", "Importo (EUR)"].map(esc).join(";"));
  for (const c of r.spese.perCategoria) rows.push([`Spese ${c.categoria}`, num(c.totaleCent)].map(esc).join(";"));
  rows.push(["Totale spese", num(r.spese.totaleCent)].map(esc).join(";"));
  rows.push(["Numero spese", String(r.spese.numeroSpese)].map(esc).join(";"));
  rows.push("");
  rows.push(["MARGINE", num(r.margineCent)].map(esc).join(";"));
  rows.push("");
  rows.push(["PER BARCA", "Incassato EUR", "Noleggio EUR", "Rimborsato EUR", "Fee NaBoat EUR", "Commissioni EUR", "Spese EUR", "Margine EUR"].map(esc).join(";"));
  for (const b of r.perBarca) {
    rows.push([b.barca, num(b.incassatoCent), num(b.noleggioCent), num(b.rimborsatoCent), num(b.feeNaboatCent), num(b.feeProviderCent), num(b.speseCent), num(b.margineCent)].map(esc).join(";"));
  }
  rows.push("");
  rows.push(["PER CANALE", "Noleggio EUR", "Fee NaBoat EUR", "Numero"].map(esc).join(";"));
  for (const c of r.perCanale) rows.push([c.canale, num(c.noleggioCent), num(c.feeNaboatCent), String(c.numero)].map(esc).join(";"));
  rows.push("");
  rows.push(["INCASSI PER METODO", "Totale EUR"].map(esc).join(";"));
  for (const m of r.perMetodo) rows.push([m.metodo, num(m.totaleCent)].map(esc).join(";"));
  return rows.join("\r\n");
}
