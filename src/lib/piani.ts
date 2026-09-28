import { prisma } from "@/lib/db";

// Gestione dei piani Free/Pro del noleggiatore. Importi e limiti sono configurabili
// da NaBoat: qui solo la logica di applicazione.

export type Piano = "free" | "pro";

// Piano effettivo: un Pro scaduto torna Free.
export async function pianoDelTenant(tenantId: string): Promise<Piano> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { pianoTipo: true, pianoScadenzaAt: true } });
  if (!t) return "free";
  if (t.pianoTipo === "pro" && t.pianoScadenzaAt && t.pianoScadenzaAt.getTime() < Date.now()) return "free";
  return t.pianoTipo === "pro" ? "pro" : "free";
}

export function ePro(p: Piano): boolean {
  return p === "pro";
}

export async function limitiFree() {
  const s = await prisma.platformSettings.findUnique({ where: { id: "singleton" }, select: { pianoFreeMaxBarche: true, pianoFreeMaxFoto: true } }).catch(() => null);
  return { maxBarche: s?.pianoFreeMaxBarche ?? 3, maxFoto: s?.pianoFreeMaxFoto ?? 5 };
}

// Alla scadenza del piano, mette in pausa le barche che eccedono il limite,
// mantenendo pubblicate le più vecchie (criterio deterministico: data di creazione).
// Non cancella nulla: le barche restano con i loro dati.
export async function applicaLimitiPiano(tenantId: string): Promise<{ messeInPausa: number }> {
  const piano = await pianoDelTenant(tenantId);
  if (piano === "pro") return { messeInPausa: 0 };
  const { maxBarche } = await limitiFree();
  const pubblicate = await prisma.boat.findMany({
    where: { tenantId, pubblicata: true, inPausa: false },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const eccedenti = pubblicate.slice(Math.max(0, maxBarche)).map((b) => b.id);
  if (eccedenti.length === 0) return { messeInPausa: 0 };
  await prisma.boat.updateMany({ where: { id: { in: eccedenti } }, data: { inPausa: true } });
  return { messeInPausa: eccedenti.length };
}

// Applica i limiti a tutte le aziende (usato dal controllo scadenze).
export async function applicaLimitiTutti(): Promise<{ aziende: number; messeInPausa: number }> {
  const tenants = await prisma.tenant.findMany({ where: { status: "active" }, select: { id: true } });
  let messe = 0;
  for (const t of tenants) messe += (await applicaLimitiPiano(t.id)).messeInPausa;
  return { aziende: tenants.length, messeInPausa: messe };
}
