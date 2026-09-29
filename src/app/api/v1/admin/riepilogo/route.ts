import { ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";

// Contatori del pannello NaBoat, calcolati dai dati reali.
export async function GET() {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const inizioOggi = new Date(); inizioOggi.setHours(0, 0, 0, 0);
  const fineOggi = new Date(); fineOggi.setHours(23, 59, 59, 999);
  const [aziendeDaApprovare, messaggiDaLeggere, modelliDaVerificare, recensioni, barchePubblicate, clienti, prenotazioniOggi, noleggiatori, patentiDaVerificare] = await Promise.all([
    prisma.tenant.count({ where: { status: "pending" } }),
    prisma.richiestaContatto.count({ where: { lettoAt: null } }),
    prisma.modelloBarca.count({ where: { stato: "in_verifica" } }),
    prisma.recensione.count(),
    prisma.boat.count({ where: { uso: "noleggio", archiviato: false, pubblicata: true, inPausa: false, bloccataAdmin: false } }),
    prisma.customer.count(),
    prisma.booking.count({ where: { startAt: { gte: inizioOggi, lte: fineOggi } } }),
    prisma.tenant.count({ where: { status: "active" } }),
    prisma.patenteNautica.count({ where: { stato: "in_verifica" } }),
  ]);
  return ok({ aziendeDaApprovare, messaggiDaLeggere, modelliDaVerificare, recensioni, barchePubblicate, clienti, prenotazioniOggi, noleggiatori, patentiDaVerificare });
}
