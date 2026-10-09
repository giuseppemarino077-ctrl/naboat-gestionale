// Tipi di imbarcazione più comuni tra i privati in ormeggio/rimessaggio:
// ogni tipo ha una propria sagoma laterale riconoscibile nella griglia.

export type FormaBarca =
  | "gozzo"
  | "open"
  | "cabinato"
  | "motoscafo"
  | "gommone"
  | "tender"
  | "moto_acqua"
  | "pesca"
  | "lancia"
  | "vela"
  | "catamarano"
  | "houseboat"
  | "remi";

export type SettoreBarca = "motore" | "vela";

export type TipoBarca = {
  codice: string;
  nome: string;
  forma: FormaBarca;
  settore: SettoreBarca;
};

export const TIPI_BARCA: TipoBarca[] = [
  { codice: "gozzo", nome: "Gozzo", forma: "gozzo", settore: "motore" },
  { codice: "open", nome: "Open", forma: "open", settore: "motore" },
  { codice: "cabinato", nome: "Cabinato", forma: "cabinato", settore: "motore" },
  { codice: "motoscafo", nome: "Motoscafo / offshore", forma: "motoscafo", settore: "motore" },
  { codice: "gommone", nome: "Gommone (pneumatico)", forma: "gommone", settore: "motore" },
  { codice: "tender", nome: "Tender / battello", forma: "tender", settore: "motore" },
  { codice: "moto_acqua", nome: "Moto d'acqua", forma: "moto_acqua", settore: "motore" },
  { codice: "pesca", nome: "Barca da pesca", forma: "pesca", settore: "motore" },
  { codice: "lancia", nome: "Lancia", forma: "lancia", settore: "motore" },
  { codice: "vela", nome: "Barca a vela", forma: "vela", settore: "vela" },
  { codice: "catamarano", nome: "Catamarano", forma: "catamarano", settore: "vela" },
  { codice: "houseboat", nome: "Casa galleggiante", forma: "houseboat", settore: "motore" },
  { codice: "remi", nome: "Barca a remi", forma: "remi", settore: "motore" },
];

const PER_CODICE = new Map(TIPI_BARCA.map((t) => [t.codice, t]));

export function tipoDiCodice(codice: string | null | undefined): TipoBarca | null {
  if (!codice) return null;
  return PER_CODICE.get(codice) ?? null;
}

export function nomeTipo(codice: string | null | undefined): string | null {
  return tipoDiCodice(codice)?.nome ?? null;
}

// Etichetta leggibile del tipo: prima il codice canonico, altrimenti il testo
// salvato in passato (dati storici).
export function etichettaTipo(tipoCodice: string | null | undefined, tipoTesto?: string | null): string | null {
  return nomeTipo(tipoCodice) ?? (tipoTesto?.trim() || null);
}

// Deduce un tipo dal testo libero salvato in passato su Boat.tipo (dati storici).
export function codiceDaTesto(testo: string | null | undefined): string | null {
  if (!testo) return null;
  const t = testo.toLowerCase();
  for (const tipo of TIPI_BARCA) {
    if (t.includes(tipo.codice) || t.includes(tipo.nome.toLowerCase())) return tipo.codice;
  }
  if (/pneumat|rib/.test(t)) return "gommone";
  if (/vela|velier|sailing|sail/.test(t)) return "vela";
  if (/catama/.test(t)) return "catamarano";
  if (/jet ?ski|moto d.acqua|wave/.test(t)) return "moto_acqua";
  if (/cabinat|yacht|fly/.test(t)) return "cabinato";
  if (/open/.test(t)) return "open";
  if (/gozzo|lancia/.test(t)) return "gozzo";
  if (/remi|rowing/.test(t)) return "remi";
  return null;
}

export function formaBarca(tipoCodice: string | null | undefined, tipoTesto?: string | null): FormaBarca {
  return tipoDiCodice(tipoCodice)?.forma ?? tipoDiCodice(codiceDaTesto(tipoTesto))?.forma ?? "open";
}
