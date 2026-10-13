import { fail } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda, requireTenant } from "@/modules/piattaforma/accesso-azienda";
import { prodottiAbilitati, type Prodotto } from "@/modules/piattaforma/prodotti";

export async function requireProdotto(req: Request, prodotto: Prodotto, opts: { skipper?: boolean; ignoraAbbonamento?: boolean } = {}) {
  const t = await (opts.skipper ? requireTenant(req, opts) : requireAzienda(req, opts));
  if ("error" in t) return t;
  if (t.role !== "owner" && t.role !== "superadmin" && !(prodotto === "ormeggio" ? t.accessoOrmeggio : t.accessoNoleggio)) return { error: fail("Non hai accesso a questo modulo", 403) };
  const tenant = await prisma.tenant.findUnique({
    where: { id: t.tenantId },
    select: { tipoModulo: true, moduloOrmeggio: true },
  });
  if (!tenant || !prodottiAbilitati(tenant)[prodotto]) {
    return { error: fail(`Modulo ${prodotto === "ormeggio" ? "Ormeggio" : "Noleggio"} non attivo per questa azienda`, 403) };
  }
  return t;
}
