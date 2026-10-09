import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { identitaCorrente } from "@/lib/identita";
import { mustTwoFa } from "@/modules/piattaforma/accesso-azienda";
import { ingressoProdotto, prodottiAbilitati, type Prodotto } from "@/modules/piattaforma/prodotti";

export const requirePaginaProdotto = cache(async (prodotto: Prodotto) => {
  const id = await identitaCorrente();
  if (!id.ok) redirect("/gestionale/accesso");
  const u = id.user;
  if (u.role === "superadmin") return;
  if (!u.tenantId || u.tenantStatus !== "active") redirect("/gestionale/stato");
  if (mustTwoFa(u.role, id.session.twofa)) redirect("/gestionale/impostazioni/sicurezza");
  if (!["owner", "operatore", "skipper"].includes(u.role)) redirect("/gestionale/accesso");
  if (prodotto === "ormeggio" && u.role === "skipper") redirect("/gestionale/impostazioni/sicurezza");
  const tenant = await prisma.tenant.findUnique({ where: { id: u.tenantId }, select: { tipoModulo: true, moduloOrmeggio: true } });
  if (!tenant) redirect("/gestionale/stato");
  const prodotti = prodottiAbilitati(tenant);
  if (!prodotti[prodotto]) redirect(ingressoProdotto(prodotti.ormeggio ? "ormeggio" : "noleggio"));
});
