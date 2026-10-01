import { prisma } from "@/lib/db";

// Rimozione operativa differita: la richiesta è persistita (eliminazioneRichiestaAt)
// e la finalizzazione è un comando idempotente e schedulabile. Non si affida a un
// timer del browser: funziona dopo chiusura scheda, refresh e riavvio del processo.
// La barca con storico NON viene cancellata fisicamente: viene archiviata e sparisce
// dalla flotta/calendario ordinari, conservando contratti, conti, report e audit.
export async function finalizzaRimozioni(tenantId?: string): Promise<number> {
  const adesso = new Date();
  const esito = await prisma.boat.updateMany({
    where: {
      ...(tenantId ? { tenantId } : {}),
      eliminazioneAt: { not: null, lte: adesso },
      archiviato: false,
    },
    data: { archiviato: true, eliminazioneAt: null },
  });
  return esito.count;
}

// Verifica se esistono attività incompatibili con la rimozione: prenotazioni attive,
// opzioni valide, barca in mare, checkout/incassi pendenti. Restituisce il motivo o null.
export async function attivitaIncompatibili(tenantId: string, boatId: string): Promise<string | null> {
  const b = await prisma.boat.findFirst({ where: { id: boatId, tenantId }, select: { id: true } });
  if (!b) return "Barca non trovata";
  const attive = await prisma.booking.count({
    where: { tenantId, boatId, stato: { in: ["prenotata", "in_mare"] } },
  });
  if (attive > 0) return "La barca ha prenotazioni confermate o in mare";
  const opzioni = await prisma.booking.count({
    where: { tenantId, boatId, stato: "da_confermare", OR: [{ opzioneScadenzaAt: null }, { opzioneScadenzaAt: { gt: new Date() } }] },
  });
  if (opzioni > 0) return "La barca ha richieste da confermare ancora valide";
  const incassi = await prisma.payment.count({ where: { tenantId, stato: { in: ["pagato", "in_attesa"] }, booking: { boatId, tenantId } } });
  if (incassi > 0) return "Esistono incassi collegati alla barca";
  return null;
}
