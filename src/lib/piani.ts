import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// Gestione dei piani Free/Pro del noleggiatore. Importi e limiti sono configurabili
// da NaBoat: qui solo la logica di applicazione.
// Il piano effettivo si calcola SEMPRE da pianoDelTenant/pianoDelTenantTx (un Pro
// scaduto torna Free) e i limiti vanno applicati in transazione, dopo bloccaPiano:
// così due pubblicazioni simultanee non superano il tetto.

export type Piano = "free" | "pro";

type Db = Prisma.TransactionClient;

// Piano effettivo dentro una transazione (stessa regola della versione senza tx).
export async function pianoDelTenantTx(tx: Db, tenantId: string): Promise<Piano> {
  const t = await tx.tenant.findUnique({ where: { id: tenantId }, select: { pianoTipo: true, pianoScadenzaAt: true } });
  if (!t) return "free";
  if (t.pianoTipo === "pro" && t.pianoScadenzaAt && t.pianoScadenzaAt.getTime() < Date.now()) return "free";
  return t.pianoTipo === "pro" ? "pro" : "free";
}

// Piano effettivo: un Pro scaduto torna Free.
export async function pianoDelTenant(tenantId: string): Promise<Piano> {
  return pianoDelTenantTx(prisma, tenantId);
}

export function ePro(p: Piano): boolean {
  return p === "pro";
}

export async function limitiFreeTx(tx: Db) {
  const s = await tx.platformSettings.findUnique({ where: { id: "singleton" }, select: { pianoFreeMaxBarche: true, pianoFreeMaxFoto: true } }).catch(() => null);
  return { maxBarche: s?.pianoFreeMaxBarche ?? 3, maxFoto: s?.pianoFreeMaxFoto ?? 5 };
}

export async function limitiFree() {
  return limitiFreeTx(prisma);
}

// Serializza i conteggi del piano per tenant: le pubblicazioni concorrenti si
// accodano qui e vedono sempre il totale aggiornato.
export async function bloccaPiano(tx: Db, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`piano:${tenantId}`}))`;
}

export type EsitoLimiti = { ok: true } | { ok: false; messaggio: string };

// Limite foto del piano effettivo. Da usare quando la barca entra/resta nel catalogo.
export async function verificaFotoPiano(tx: Db, tenantId: string, fotoCount: number): Promise<EsitoLimiti> {
  if ((await pianoDelTenantTx(tx, tenantId)) === "pro") return { ok: true };
  const { maxFoto } = await limitiFreeTx(tx);
  if (fotoCount > maxFoto) return { ok: false, messaggio: `Piano Free: massimo ${maxFoto} foto per barca` };
  return { ok: true };
}

// Limiti del piano per pubblicare una barca (numero barche + foto).
// `boatId` è null quando la barca è appena creata e non è ancora contata.
export async function verificaPubblicazione(tx: Db, tenantId: string, input: { boatId: string | null; fotoCount: number }): Promise<EsitoLimiti> {
  const foto = await verificaFotoPiano(tx, tenantId, input.fotoCount);
  if (!foto.ok) return foto;
  if ((await pianoDelTenantTx(tx, tenantId)) === "pro") return { ok: true };
  const { maxBarche } = await limitiFreeTx(tx);
  const altre = await tx.boat.count({
    where: { tenantId, pubblicata: true, inPausa: false, bloccataAdmin: false, ...(input.boatId ? { id: { not: input.boatId } } : {}) },
  });
  if (altre + 1 > maxBarche) return { ok: false, messaggio: `Piano Free: massimo ${maxBarche} barche pubblicate` };
  return { ok: true };
}

// Alla scadenza del piano, mette in pausa le barche che eccedono il limite,
// mantenendo pubblicate le più vecchie (criterio deterministico: data di creazione).
// Non cancella nulla: le barche restano con i loro dati.
export async function applicaLimitiPiano(tenantId: string): Promise<{ messeInPausa: number }> {
  return prisma.$transaction(async (tx) => {
    await bloccaPiano(tx, tenantId);
    const piano = await pianoDelTenantTx(tx, tenantId);
    if (piano === "pro") return { messeInPausa: 0 };
    const { maxBarche } = await limitiFreeTx(tx);
    const pubblicate = await tx.boat.findMany({
      where: { tenantId, pubblicata: true, inPausa: false, bloccataAdmin: false },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const eccedenti = pubblicate.slice(Math.max(0, maxBarche)).map((b) => b.id);
    if (eccedenti.length === 0) return { messeInPausa: 0 };
    await tx.boat.updateMany({ where: { id: { in: eccedenti } }, data: { inPausa: true } });
    return { messeInPausa: eccedenti.length };
  });
}

// Applica i limiti a tutte le aziende (usato dal controllo scadenze).
export async function applicaLimitiTutti(): Promise<{ aziende: number; messeInPausa: number }> {
  const tenants = await prisma.tenant.findMany({ where: { status: "active" }, select: { id: true } });
  let messe = 0;
  for (const t of tenants) messe += (await applicaLimitiPiano(t.id)).messeInPausa;
  return { aziende: tenants.length, messeInPausa: messe };
}
