import { prisma } from "@/lib/db";

// Validazione dei riferimenti in ingresso: il filtro sul record principale per
// tenantId non basta. Ogni id collegato (porto, skipper, extra, addetto, barche)
// deve appartenere alla stessa azienda (o essere un catalogo globale ammesso),
// altrimenti l'azienda A potrebbe collegare entità della azienda B.

export async function portoDelTenant(tenantId: string, portoId: string) {
  return prisma.porto.findFirst({ where: { id: portoId, tenantId }, select: { id: true } });
}

// Il catalogo dei modelli è condiviso: si accetta qualsiasi modello esistente,
// non solo quelli verificati (la verifica è una moderazione, non un permesso di uso).
export async function modelloValido(modelloId: string) {
  return prisma.modelloBarca.findUnique({ where: { id: modelloId }, select: { id: true } });
}

export async function addettoDelTenant(tenantId: string, addettoId: string) {
  return prisma.user.findFirst({ where: { id: addettoId, tenantId }, select: { id: true } });
}

export async function skipperDelTenant(tenantId: string, skipperId: string) {
  return prisma.skipper.findFirst({ where: { id: skipperId, tenantId, attivo: true }, select: { id: true } });
}

export async function extrasDelTenant(tenantId: string, ids: string[]): Promise<{ ok: true } | { ok: false; mancanti: string[] }> {
  if (!ids.length) return { ok: true };
  const unici = [...new Set(ids)];
  const trovati = await prisma.extra.findMany({ where: { tenantId, id: { in: unici } }, select: { id: true } });
  const set = new Set(trovati.map((e) => e.id));
  const mancanti = unici.filter((id) => !set.has(id));
  return mancanti.length ? { ok: false, mancanti } : { ok: true };
}

export async function barcheDelTenant(tenantId: string, ids: string[]): Promise<{ ok: true } | { ok: false; mancanti: string[] }> {
  if (!ids.length) return { ok: true };
  const unici = [...new Set(ids)];
  const trovati = await prisma.boat.findMany({ where: { tenantId, id: { in: unici } }, select: { id: true } });
  const set = new Set(trovati.map((b) => b.id));
  const mancanti = unici.filter((id) => !set.has(id));
  return mancanti.length ? { ok: false, mancanti } : { ok: true };
}
