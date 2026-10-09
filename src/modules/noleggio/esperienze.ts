// Catalogo condiviso delle esperienze offerte dalle barche (marketplace).
// I codici sono stabili: sono essi a viaggiare nei filtri, non le etichette.
export type VoceEsperienza = { codice: string; nome: string };
export type GruppoEsperienze = { gruppo: string; voci: VoceEsperienza[] };

export const ESPERIENZE: GruppoEsperienze[] = [
  {
    gruppo: "Tipo di barca",
    voci: [
      { codice: "catamarano", nome: "Tour in catamarano" },
      { codice: "barca_classica", nome: "Tour in barca classica" },
      { codice: "yacht_lusso", nome: "Tour in yacht di lusso" },
      { codice: "barca_motore", nome: "Giro in barca a motore" },
      { codice: "barca_vela", nome: "Tour in barca a vela" },
      { codice: "motoscafo", nome: "Tour in motoscafo" },
      { codice: "barca_sostenibile", nome: "Giro in barca sostenibile" },
    ],
  },
  {
    gruppo: "Attività",
    voci: [
      { codice: "addio_celibato", nome: "Crociera di addio al celibato" },
      { codice: "gita_pesca", nome: "Gita di pesca" },
      { codice: "lezione_vela", nome: "Lezione di vela" },
      { codice: "immersioni", nome: "Gita di immersioni subacquee" },
      { codice: "taxi", nome: "Taxi / transfer in barca" },
    ],
  },
  {
    gruppo: "Occasione speciale",
    voci: [
      { codice: "cena", nome: "Crociera con cena" },
      { codice: "pranzo", nome: "Pranzo in crociera" },
      { codice: "notturno", nome: "Tour in barca notturno" },
      { codice: "feste", nome: "Giro in barca per feste" },
      { codice: "romantica", nome: "Crociera romantica" },
      { codice: "tramonto", nome: "Crociera al tramonto" },
      { codice: "aziendale", nome: "Evento aziendale" },
    ],
  },
  {
    gruppo: "Altro",
    voci: [
      { codice: "lago", nome: "Tour del lago" },
      { codice: "fiume", nome: "Tour in barca sul fiume" },
      { codice: "cetacei", nome: "Tour di osservazione di delfini e balene" },
    ],
  },
];

export const CODICI_ESPERIENZA = new Set(ESPERIENZE.flatMap((g) => g.voci.map((v) => v.codice)));

const NOMI = new Map(ESPERIENZE.flatMap((g) => g.voci.map((v) => [v.codice, v.nome] as const)));

export function nomeEsperienza(codice: string): string {
  return NOMI.get(codice) ?? codice;
}

// Etichette per un elenco di codici, con le esperienze personalizzate in coda.
export function etichetteEsperienze(codici: string[], personalizzate: string[] = []): string[] {
  const note = codici.filter((c) => CODICI_ESPERIENZA.has(c)).map(nomeEsperienza);
  return [...note, ...personalizzate];
}
