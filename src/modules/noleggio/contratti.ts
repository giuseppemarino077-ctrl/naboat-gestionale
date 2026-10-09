import { CONDIZIONI_NOLEGGIO } from "@/modules/noleggio/contratto-testo";
export { CONDIZIONI_NOLEGGIO } from "@/modules/noleggio/contratto-testo";

// --- Noleggio ---------------------------------------------------------------

export type SnapshotNoleggio = {
  schema: "noleggio/v1";
  generatoAt: string;
  azienda: { nome: string; logo: string | null; puntoPartenza: string | null; telefono: string | null };
  cliente: string | null;
  passeggeri: number;
  periodo: { inizioAt: string; fineAt: string };
  destinazione: string | null;
  formula: string | null;
  barca: { nome: string; tipo: string | null; modello?: string | null; capienza: number | null; potenzaCv: number | null; patenteRichiesta: boolean };
  skipper: string | null;
  patenteOk: boolean;
  importi: { prezzoCent: number | null; cauzioneCent: number | null };
  condizioni: string[];
};

export function snapshotNoleggio(
  dati: {
    azienda: { nome: string; logo: string | null; puntoPartenza: string | null; telefono: string | null };
    cliente: string | null;
    passeggeri: number;
    inizioAt: Date;
    fineAt: Date;
    destinazione: string | null;
    formula: string | null;
    barca: { nome: string; tipo: string | null; modello?: string | null; capienza: number | null; potenzaCv: number | null; patenteRichiesta: boolean };
    skipper: string | null;
    patenteOk: boolean;
    prezzoCent: number | null;
    cauzioneCent: number | null;
    condizioni?: string[] | null;
  },
  adesso: Date = new Date()
): SnapshotNoleggio {
  const condizioni = dati.condizioni && dati.condizioni.length ? dati.condizioni : CONDIZIONI_NOLEGGIO;
  return {
    schema: "noleggio/v1",
    generatoAt: adesso.toISOString(),
    azienda: dati.azienda,
    cliente: dati.cliente,
    passeggeri: dati.passeggeri,
    periodo: { inizioAt: dati.inizioAt.toISOString(), fineAt: dati.fineAt.toISOString() },
    destinazione: dati.destinazione,
    formula: dati.formula,
    barca: dati.barca,
    skipper: dati.skipper,
    patenteOk: dati.patenteOk,
    importi: { prezzoCent: dati.prezzoCent, cauzioneCent: dati.cauzioneCent },
    condizioni,
  };
}

// Trasforma il testo personalizzato (una clausola per riga) nell'elenco delle
// condizioni. Un testo vuoto lascia le condizioni predefinite.
export function condizioniDaTesto(testo: string | null | undefined): string[] | null {
  if (!testo) return null;
  const righe = testo.split("\n").map((r) => r.trim()).filter(Boolean);
  return righe.length ? righe : null;
}
