import { requireProdotto } from "@/modules/piattaforma/accesso-prodotti";

export function requireNoleggio(req: Request) {
  return requireProdotto(req, "noleggio", { skipper: true });
}

export function requireAziendaNoleggio(req: Request, opts: { ignoraAbbonamento?: boolean } = {}) {
  return requireProdotto(req, "noleggio", opts);
}
