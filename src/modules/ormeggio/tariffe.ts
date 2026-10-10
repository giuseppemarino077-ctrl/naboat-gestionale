import type { ServizioOrmeggio } from "./use-catalogo-servizi";

export type PeriodoTariffa = "giornaliera" | "mensile";

export function tariffaSosta(servizi: ServizioOrmeggio[], periodo: PeriodoTariffa) {
  const unita = periodo === "mensile" ? "mese" : "giorno";
  const nome = periodo === "mensile" ? "ormeggio mensile" : "ormeggio giornaliero";
  const candidate = servizi.filter((s) => s.unita?.trim().toLocaleLowerCase("it-IT") === unita);
  return candidate.find((s) => s.nome.trim().toLocaleLowerCase("it-IT") === nome)
    ?? candidate.find((s) => /ormeggio|sosta/i.test(s.nome))
    ?? (periodo === "mensile" && candidate.length === 1 ? candidate[0] : undefined);
}

export function euroCampo(cent: number | null) {
  return cent === null ? "" : (cent / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
}

export function centDaEuro(valore: string): number | null {
  const testo = valore.trim();
  if (!testo) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(testo)) throw new Error("Inserisci un importo valido, con al massimo due decimali e maggiore o uguale a zero.");
  const cent = Math.round(Number(testo.replace(",", ".")) * 100);
  if (!Number.isSafeInteger(cent) || cent > 100000000) throw new Error("L’importo supera il limite consentito.");
  return cent;
}

type PreventivoSosta = {
  stato: "calcolato" | "incompleto" | "date_non_valide" | "tariffe_mancanti" | "limite";
  importoCent: number | null;
  mesi: number;
  giorni: number;
  giorniTotali: number;
  messaggio: string;
};

function giornoUTC(valore: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valore)) return null;
  const data = new Date(`${valore}T00:00:00.000Z`);
  return Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== valore ? null : data;
}

function anniversarioMensile(inizio: Date, mesi: number): Date {
  const fineMese = new Date(inizio);
  fineMese.setUTCFullYear(inizio.getUTCFullYear(), inizio.getUTCMonth() + mesi + 1, 0);
  const data = new Date(fineMese);
  data.setUTCDate(Math.min(inizio.getUTCDate(), fineMese.getUTCDate()));
  return data;
}

export function preventivoSosta(inizio: string, fine: string, giornalieraCent: number | null, mensileCent: number | null): PreventivoSosta {
  const vuoto = { importoCent: null, mesi: 0, giorni: 0, giorniTotali: 0 };
  if (!inizio || !fine) return { ...vuoto, stato: "incompleto", messaggio: "Seleziona inizio e fine per ottenere il prezzo suggerito." };
  const dal = giornoUTC(inizio);
  const al = giornoUTC(fine);
  if (!dal || !al || al < dal) return { ...vuoto, stato: "date_non_valide", messaggio: "Indica date valide, con la fine uguale o successiva all’inizio." };
  const fineEsclusa = new Date(al);
  fineEsclusa.setUTCDate(fineEsclusa.getUTCDate() + 1);
  const giornoMs = 86400000;
  const giorniTotali = (fineEsclusa.getTime() - dal.getTime()) / giornoMs;
  let mesi = (fineEsclusa.getUTCFullYear() - dal.getUTCFullYear()) * 12 + fineEsclusa.getUTCMonth() - dal.getUTCMonth();
  if (anniversarioMensile(dal, mesi) > fineEsclusa) mesi--;
  const giorni = (fineEsclusa.getTime() - anniversarioMensile(dal, mesi).getTime()) / giornoMs;
  const durata = { mesi, giorni, giorniTotali };
  if ((mesi > 0 && mensileCent === null) || (giorni > 0 && giornalieraCent === null)) {
    const mancanti = [mesi > 0 && mensileCent === null ? "mensile" : "", giorni > 0 && giornalieraCent === null ? "giornaliera" : ""].filter(Boolean).join(" e ");
    return { ...durata, importoCent: null, stato: "tariffe_mancanti", messaggio: `Imposta la tariffa ${mancanti} in Economia, oppure inserisci un prezzo concordato.` };
  }
  const importoCent = mesi * (mensileCent ?? 0) + giorni * (giornalieraCent ?? 0);
  if (!Number.isSafeInteger(importoCent) || importoCent < 0 || importoCent > 100000000) return { ...durata, importoCent: null, stato: "limite", messaggio: "Il prezzo suggerito supera il limite consentito. Inserisci un importo concordato valido." };
  return { ...durata, importoCent, stato: "calcolato", messaggio: "" };
}
