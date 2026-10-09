// Condizioni predefinite del contratto di noleggio. File senza dipendenze Node,
// così può essere importato anche dai componenti client (anteprima e modifica).
export const CONDIZIONI_NOLEGGIO = [
  "1. Il cliente dichiara di aver ricevuto l'imbarcazione in buono stato e di riconsegnarla nelle stesse condizioni, salvo normale usura.",
  "2. Il cliente si impegna a rispettare le norme di navigazione, la capienza massima e a non condurre l'imbarcazione in condizioni meteomarine sfavorevoli.",
  "3. I danni causati da uso improprio sono a carico del cliente; eventuali addebiti vengono trattenuti dalla cauzione.",
  "4. Il cliente restituisce l'imbarcazione nelle stesse condizioni in cui l'ha ricevuta.",
  "5. L'uscita può essere annullata per motivi di sicurezza o condizioni meteo sfavorevoli.",
];

export function testoCondizioniPredefinito(): string {
  return CONDIZIONI_NOLEGGIO.join("\n");
}
