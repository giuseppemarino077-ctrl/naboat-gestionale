import { prodottoDalPercorso } from "@/modules/piattaforma/prodotti";

type Profilo = { role: string; ruoloOrmeggio?: string; vedeImporti: boolean; accessoNoleggio?: boolean; accessoOrmeggio?: boolean };
export function paginaConsentita(u: Profilo, path: string) {
  if (u.role === "superadmin") return true;
  const prodotto = prodottoDalPercorso(path);
  if (prodotto === "noleggio" && u.accessoNoleggio === false) return false;
  if (prodotto === "ormeggio" && u.accessoOrmeggio === false) return false;
  if (u.role === "owner" || !u.accessoOrmeggio) return true;
  if (path.startsWith("/gestionale/impostazioni/sicurezza") || path === "/gestionale/aziende") return true;
  if (prodotto === "noleggio") return true;
  if (u.ruoloOrmeggio === "visualizzazione") return path === "/gestionale/ormeggio";
  if (u.ruoloOrmeggio === "addetto") return path === "/gestionale/ormeggio" || path === "/gestionale/ormeggio/tv" || /^\/gestionale\/ormeggio\/(da-fare|movimenti|permanenza\/[^/]+)$/.test(path);
  if (path.startsWith("/gestionale/impostazioni") || path.startsWith("/gestionale/ormeggio/configurazione")) return false;
  if ((path.startsWith("/gestionale/ormeggio/conti") || path.startsWith("/gestionale/ormeggio/statistiche") || path === "/gestionale/registro") && !u.vedeImporti) return false;
  return true;
}
