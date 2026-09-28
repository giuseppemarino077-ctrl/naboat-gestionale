import { prisma } from "@/lib/db";

// Registro completo delle modifiche: quando è attivo (impostazione di NaBoat) ogni modifica
// importante viene scritta nel registro azioni con i valori prima e dopo, così si può capire
// chi ha cambiato cosa e riportare indietro un valore a mano.

let cache: { valore: boolean; scadenza: number } | null = null;

export async function registroCompleto(): Promise<boolean> {
  if (cache && cache.scadenza > Date.now()) return cache.valore;
  const s = await prisma.backupSettings
    .findUnique({ where: { id: "singleton" }, select: { registroCompleto: true } })
    .catch(() => null);
  const valore = s?.registroCompleto !== false;
  cache = { valore, scadenza: Date.now() + 30000 };
  return valore;
}

// Confronta due versioni dello stesso record e tiene solo i campi cambiati.
export function differenze(prima: Record<string, unknown> | null, dopo: Record<string, unknown> | null) {
  if (!prima || !dopo) return null;
  const cambi: Record<string, { prima: unknown; dopo: unknown }> = {};
  const chiavi = new Set([...Object.keys(prima), ...Object.keys(dopo)]);
  for (const k of chiavi) {
    if (k === "updatedAt" || k === "aggiornatoAt") continue;
    const a = prima[k];
    const b = dopo[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) cambi[k] = { prima: a ?? null, dopo: b ?? null };
  }
  return Object.keys(cambi).length ? cambi : null;
}

type Opzioni = {
  tenantId: string | null;
  actorId?: string | null;
  azione: string;
  entita: string;
  entitaId: string;
  prima?: Record<string, unknown> | null;
  dopo?: Record<string, unknown> | null;
  nota?: string;
};

export async function traccia(o: Opzioni) {
  try {
    if (!(await registroCompleto())) return;    const cambi = differenze(o.prima ?? null, o.dopo ?? null);
    const dettagli = JSON.stringify({
      ...(o.nota ? { nota: o.nota } : {}),
      ...(o.prima === undefined ? {} : { prima: o.prima }),
      ...(o.dopo === undefined ? {} : { dopo: o.dopo }),
      ...(cambi ? { cambi } : {}),
    });
    await prisma.auditLog.create({
      data: {
        tenantId: o.tenantId,
        actorId: o.actorId ?? null,
        azione: o.azione,
        entita: o.entita,
        entitaId: o.entitaId,
        dettagli: dettagli.slice(0, 20000),
      },
    });
  } catch {
    // il registro non deve mai bloccare l'operazione principale
  }
}

// Storico operativo sempre attivo (a prescindere dall'interruttore «registro completo»):
// serve a mostrare chi ha fatto cosa su prenotazioni e verbali.
export async function registraAzione(o: { tenantId: string | null; actorId?: string | null; azione: string; entita: string; entitaId: string; nota?: string }) {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: o.tenantId,
        actorId: o.actorId ?? null,
        azione: o.azione,
        entita: o.entita,
        entitaId: o.entitaId,
        ...(o.nota ? { dettagli: JSON.stringify({ nota: o.nota }).slice(0, 20000) } : {}),
      },
    });
  } catch {
    // non deve bloccare l'operazione
  }
}
