export type Stato = "in_sosta" | "da_fare" | "in_mare" | "bloccata";
export type AttivitaQuadro = {
  id: string;
  tipo: string;
  stato: string;
  dataPrevista: string | null;
  addetto: { nome: string | null } | null;
};
export type Perm = {
  id: string;
  boatId: string;
  boatNome: string;
  boatStato: string;
  boatTipo: string | null;
  boatTipoCodice: string | null;
  proprietario: string | null;
  telefono: string | null;
  tipo: string;
  finePrevistaAt: string | null;
  colore: "verde" | "giallo" | "rosso";
  motivi: string[];
  segnalazioni: { tipo: "attivita" | "contratto" | "conto"; descrizione: string; dettagli?: string[] }[];
  statoGriglia: Stato;
  inMare: boolean;
  attivitaDaFare: number;
  attivitaAperte: AttivitaQuadro[];
};
export type Posto = { id: string; riga: number; colonna: number; codice: string; bloccato: boolean; permanenza: Perm | null };
export type Area = { id: string; nome: string; righe: number; colonne: number; posti: Posto[] };
