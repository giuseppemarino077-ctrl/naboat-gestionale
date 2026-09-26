import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { piano } from "@/lib/backup";

// Piano di backup per lo script sul server. Protetto dal segreto di cron.
export async function GET(req: Request) {
  const segreto = process.env.CRON_SECRET;
  if (!segreto) return fail("CRON_SECRET non configurato", 503);
  if (req.headers.get("x-cron-secret") !== segreto) return fail("Non autorizzato", 401);

  const p = await piano();
  const esecuzione = await prisma.backupRun.create({
    data: {
      esito: "in_corso",
      destinazioni: p.destinazioni.join(","),
      includiFoto: p.includiFoto,
    },
  });
  return ok({ ...p, esecuzioneId: esecuzione.id });
}
