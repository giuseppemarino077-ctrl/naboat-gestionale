// Catalogo dotazioni predefinito. Le categorie seguono il riferimento BOATLY
// (Navigazione, Comfort, Intrattenimento, Cucina, Elettricità, Sport acquatici, Altro).
// Il catalogo è per azienda e modificabile: queste voci sono il punto di partenza,
// non un elenco chiuso. Le stringhe legacy in Boat.dotazioni restano valide.
export const CATEGORIE_DOTAZIONI = [
  "NAVIGATION",
  "COMFORT",
  "ENTERTAINMENT",
  "KITCHEN",
  "ELECTRICAL",
  "WATER_SPORTS",
  "OTHER",
] as const;
export type CategoriaDotazione = (typeof CATEGORIE_DOTAZIONI)[number];

export const ETICHETTA_CATEGORIA: Record<string, string> = {
  NAVIGATION: "Navigazione",
  COMFORT: "Comfort",
  ENTERTAINMENT: "Intrattenimento",
  KITCHEN: "Cucina",
  ELECTRICAL: "Elettricità",
  WATER_SPORTS: "Sport acquatici",
  OTHER: "Altro",
};

export const CATALOGO_PREDEFINITO: { categoria: CategoriaDotazione; nome: string; descrizione?: string }[] = [
  { categoria: "NAVIGATION", nome: "Ecoscandaglio", descrizione: "Strumento di lettura del fondale" },
  { categoria: "NAVIGATION", nome: "GPS plotter" },
  { categoria: "NAVIGATION", nome: "VHF" },
  { categoria: "NAVIGATION", nome: "Bussola" },
  { categoria: "COMFORT", nome: "Prendisole" },
  { categoria: "COMFORT", nome: "Tendalino" },
  { categoria: "COMFORT", nome: "Doccia di coperta" },
  { categoria: "COMFORT", nome: "Scaletta da bagno" },
  { categoria: "COMFORT", nome: "Cuscinerie" },
  { categoria: "COMFORT", nome: "Frigorifero" },
  { categoria: "ENTERTAINMENT", nome: "Impianto audio" },
  { categoria: "ENTERTAINMENT", nome: "Bluetooth" },
  { categoria: "KITCHEN", nome: "Cucina di bordo" },
  { categoria: "KITCHEN", nome: "Fornello" },
  { categoria: "ELECTRICAL", nome: "Presa 12V" },
  { categoria: "ELECTRICAL", nome: "Pannello solare" },
  { categoria: "ELECTRICAL", nome: "Batteria servizi" },
  { categoria: "WATER_SPORTS", nome: "Snorkeling" },
  { categoria: "WATER_SPORTS", nome: "Sup / paddle" },
  { categoria: "WATER_SPORTS", nome: "Tender" },
  { categoria: "WATER_SPORTS", nome: "Gommone" },
  { categoria: "OTHER", nome: "Ancora" },
  { categoria: "OTHER", nome: "Giubbotti di salvataggio" },
  { categoria: "OTHER", nome: "Kit sicurezza" },
];
