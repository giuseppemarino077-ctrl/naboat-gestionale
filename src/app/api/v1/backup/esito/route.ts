import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { impostazioni } from "@/lib/backup";
import { sendMail } from "@/lib/mailer";
import { z } from "zod";

// Esito comunicato dallo script del server al portale.
const Schema = z.object({
  esecuzioneId: z.string().uuid(),
  esito: z.enum(["ok", "errore", "saltato"]),
  dimensioneByte: z.number().int().min(0).default(0),
  file: z.string().max(300).optional().nullable(),
  messaggio: z.string().max(1000).optional().nullable(),
});

export async function POST(req: Request) {
  const segreto = process.env.CRON_SECRET;
  if (!segreto) return fail("CRON_SECRET non configurato", 503);
  if (req.headers.get("x-cron-secret") !== segreto) return fail("Non autorizzato", 401);

  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);

  const upd = await prisma.backupRun
    .update({
      where: { id: p.data.esecuzioneId },
      data: {
        esito: p.data.esito,
        finitoAt: new Date(),
        dimensioneByte: p.data.dimensioneByte,
        file: p.data.file ?? null,
        messaggio: p.data.messaggio ?? null,
      },
    })
    .catch(() => null);
  if (!upd) return fail("Esecuzione non trovata", 404);

  await prisma.auditLog.create({ data: { azione: `backup.${p.data.esito}`, entita: "BackupRun", entitaId: upd.id } });

  // Avviso email se qualcosa non ha funzionato.
  if (p.data.esito === "errore") {
    const s = await impostazioni();
    if (s.avvisoEmail) {
      await sendMail(
        s.avvisoEmail,
        "NaBoat — backup non riuscito",
        `Il backup del ${upd.iniziatoAt.toLocaleString("it-IT")} è fallito.\n\nDettaglio: ${p.data.messaggio ?? "nessun dettaglio"}\n\nControlla il server: ./backups/backup.log`,
        `<p>Il backup del <b>${upd.iniziatoAt.toLocaleString("it-IT")}</b> è fallito.</p><p>Dettaglio: <code>${p.data.messaggio ?? "nessun dettaglio"}</code></p><p>Controlla il server: <code>./backups/backup.log</code></p>`
      ).catch(() => {});
    }
  }

  return ok({ registrato: true, id: upd.id });
}
