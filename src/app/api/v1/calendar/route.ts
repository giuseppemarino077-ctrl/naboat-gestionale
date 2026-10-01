import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

// Finestra massima richiedibile in una sola chiamata (un calendario non carica anni interi).
const FINESTRA_MASSIMA_GIORNI = 180;

// Campi della prenotazione necessari al planning. Token di pagamento/contratto,
// foto dei verbali e chiave di idempotenza non vengono mai esposti. Lo skipper
// assegnato è incluso solo per nome/telefono, filtrato per permessi.
const CAMPI_BOOKING = {
  id: true,
  boatId: true,
  customerId: true,
  startAt: true,
  endAt: true,
  stato: true,
  versione: true,
  updatedAt: true,
  passeggeri: true,
  clienteNome: true,
  telefono: true,
  email: true,
  destinazione: true,
  formula: true,
  offertaId: true,
  portoId: true,
  skipperId: true,
  skipperStato: true,
  skipperNote: true,
  patenteOk: true,
  patenteRisposta: true,
  note: true,
  prezzoCent: true,
  origineCanale: true,
  contrattoFirmatoAt: true,
  cauzioneStato: true,
  checkinAt: true,
  checkoutAt: true,
  boat: { select: { nome: true } },
  skipper: { select: { nome: true, telefono: true } },
} as const;

// Calendario operativo: GET ?from=ISO&to=ISO -> barche + prenotazioni + blocchi nel range.
// Lo skipper riceve soltanto le proprie uscite e senza importi o note interne.
export async function GET(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams;
  if (!q.get("from") || !q.get("to")) return fail("Parametri from/to obbligatori (ISO)", 422);
  const from = new Date(q.get("from")!);
  const to = new Date(q.get("to")!);
  if (!(from < to)) return fail("Range non valido", 422);
  // Finestra massima: un calendario non deve caricare anni in una volta sola.
  const giorni = (to.getTime() - from.getTime()) / 86400000;
  if (giorni > FINESTRA_MASSIMA_GIORNI) {
    return fail(`Intervallo troppo ampio: massimo ${FINESTRA_MASSIMA_GIORNI} giorni (richiesti ${Math.ceil(giorni)})`, 422);
  }

  const isSkipper = t.role === "skipper";
  let soloMio: string | null = null;
  if (isSkipper) {
    const suo = await prisma.skipper.findFirst({ where: { tenantId: t.tenantId, userId: t.userId }, select: { id: true } });
    soloMio = suo?.id ?? "nessuno";
  }

  const [boats, bookings, blocks, porti, offerte] = await Promise.all([
    // Il calendario del noleggio non mostra le barche in custodia (modulo ormeggio),
    // né quelle archiviate o in eliminazione.
    prisma.boat.findMany({
      where: {
        tenantId: t.tenantId,
        uso: "noleggio",
        archiviato: false,
        eliminazioneRichiestaAt: null,
      },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        tipo: true,
        codiceInterno: true,
        patenteRichiesta: true,
        capienza: true,
        potenzaCv: true,
        uso: true,
        stato: true,
        portoId: true,
        porto: { select: { nome: true } },
        modello: { select: { marca: true, modello: true } },
      },
    }),
    prisma.booking.findMany({
      where: {
        tenantId: t.tenantId,
        stato: { not: "cancellata" },
        startAt: { lt: to },
        endAt: { gt: from },
        ...(soloMio ? { skipperId: soloMio } : {}),
      },
      orderBy: { startAt: "asc" },
      select: CAMPI_BOOKING,
      take: 1000,
    }),
    prisma.block.findMany({
      where: { tenantId: t.tenantId, startAt: { lt: to }, endAt: { gt: from } },
      select: { id: true, boatId: true, startAt: true, endAt: true, motivo: true, versione: true, maintenanceId: true, boat: { select: { nome: true } }, maintenance: { select: { id: true, titolo: true } } },
      orderBy: { startAt: "asc" },
    }),
    prisma.porto.findMany({ where: { tenantId: t.tenantId }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.boatOfferta.findMany({ where: { tenantId: t.tenantId }, select: { id: true, boatId: true, codice: true, attiva: true }, orderBy: { createdAt: "asc" } }),
  ]);

  const prenotazioni = isSkipper
    ? bookings.map((b) => ({ ...b, prezzoCent: null, note: null, skipperNote: null, telefono: null, email: null }))
    : bookings;

  return ok({ from, to, boats, bookings: prenotazioni, blocks, porti, offerte });
}
