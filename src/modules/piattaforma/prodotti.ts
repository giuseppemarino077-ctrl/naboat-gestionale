export type Prodotto = "noleggio" | "ormeggio";

export type ConfigurazioneProdotti = {
  tipoModulo?: string | null;
  moduloOrmeggio?: boolean | null;
};

export function prodottiAbilitati(tenant: ConfigurazioneProdotti) {
  return {
    noleggio: !tenant.moduloOrmeggio || tenant.tipoModulo === "entrambi",
    ormeggio: tenant.moduloOrmeggio === true,
  };
}

const PERCORSI_NOLEGGIO = [
  "oggi", "calendario", "prenotazioni", "flotta", "esperienze", "clienti",
  "economia", "skipper", "meteo", "manutenzione", "marketplace", "recensioni",
  "impostazioni/porti", "impostazioni/listino",
];

export function prodottoDalPercorso(path: string): Prodotto | null {
  if (path === "/gestionale/ormeggio" || path.startsWith("/gestionale/ormeggio/")) return "ormeggio";
  if (PERCORSI_NOLEGGIO.some((p) => path === `/gestionale/${p}` || path.startsWith(`/gestionale/${p}/`))) return "noleggio";
  return null;
}

export function ingressoProdotto(prodotto: Prodotto) {
  return prodotto === "ormeggio" ? "/gestionale/ormeggio" : "/gestionale/oggi";
}
