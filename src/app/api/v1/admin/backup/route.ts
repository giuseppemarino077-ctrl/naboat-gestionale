import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { crontab, istruzioniMacchinaDelTempo, stato } from "@/lib/backup";
import { requireSuperadmin } from "@/lib/guard";
import { z } from "zod";

// NaBoat: impostazioni delle copie di sicurezza, stato e righe di crontab da installare.
export async function GET() {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const s = await stato();
  return ok({ ...s, crontab: crontab(), istruzioniTempo: istruzioniMacchinaDelTempo() });
}

const Schema = z
  .object({
    attivo: z.boolean().optional(),
    ogniOre: z.number().int().min(1).max(24).optional(),
    retentionCopie: z.number().int().min(2).max(2000).optional(),
    includiFoto: z.boolean().optional(),
    destinazioneLocale: z.boolean().optional(),
    destinazioneObjectStorage: z.boolean().optional(),
    destinazioneFtp: z.boolean().optional(),
    soloDatabase: z.boolean().optional(),
    macchinaDelTempo: z.boolean().optional(),
    replicaAttiva: z.boolean().optional(),
    replicaHost: z.string().max(200).optional().nullable(),
    registroCompleto: z.boolean().optional(),
    avvisoEmail: z.string().max(200).optional().nullable(),
  })
  .strict();

export async function PATCH(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const d = p.data;

  if (d.destinazioneObjectStorage && (!process.env.S3_ENDPOINT || !process.env.S3_BUCKET || !process.env.S3_ACCESS_KEY)) {
    return fail("Per attivare la copia su Object Storage servono S3_ENDPOINT, S3_BUCKET e S3_ACCESS_KEY nel file .env del server", 422);
  }
  if (d.destinazioneFtp && (!process.env.FTP_HOST || !process.env.FTP_USER || !process.env.FTP_PASS)) {
    return fail("Per attivare la copia FTP servono FTP_HOST, FTP_USER e FTP_PASS nel file .env del server", 422);
  }
  if (d.replicaAttiva && !d.replicaHost?.trim()) {
    return fail("Per attivare la replica indica l'indirizzo del secondo server", 422);
  }
  if (d.avvisoEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.avvisoEmail)) {
    return fail("Indirizzo email di avviso non valido", 422);
  }

  const salvato = await prisma.backupSettings.upsert({
    where: { id: "singleton" },
    update: { ...d, replicaHost: d.replicaHost?.trim() || null, avvisoEmail: d.avvisoEmail?.trim() || null },
    create: { id: "singleton", ...d, replicaHost: d.replicaHost?.trim() || null, avvisoEmail: d.avvisoEmail?.trim() || null },
  });
  await prisma.auditLog.create({ data: { actorId: g.session.sub, azione: "backup.impostazioni", entita: "BackupSettings", entitaId: salvato.id } });
  return ok({ salvato: true });
}
