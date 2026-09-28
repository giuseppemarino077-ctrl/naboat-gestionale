import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

// Campi della prenotazione necessari al calendario. Token di pagamento/contratto,
// foto dei verbali e chiave di idempotenza non vengono mai esposti.
const CAMPI_BOOKING = {
  id: true,
  boatId: true,
  startAt: true,
  endAt: true,
  stato: true,
  passeggeri: true,
  clienteNome: true,
  telefono: true,
  destinazione: true,
  formula: true,
  skipperId: true,
  patenteOk: true,
  note: true,
  prezzoCent: true,
  cauzioneCent: true,
  cauzioneStato: true,
  origineCanale: true,
  contrattoFirmatoAt: true,
  checkinAt: true,
  checkoutAt: true,
  boat: { select: { nome: true } },
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

  const isSkipper = t.role === "skipper";
  let soloMio: string | null = null;
  if (isSkipper) {
    const suo = await prisma.skipper.findFirst({ where: { tenantId: t.tenantId, userId: t.userId }, select: { id: true } });
    soloMio = suo?.id ?? "nessuno";
  }

  const [boats, bookings, blocks] = await Promise.all([
    // Il calendario del noleggio non mostra le barche in custodia (modulo ormeggio)
    // né quelle archiviate.
    prisma.boat.findMany({
      where: { tenantId: t.tenantId, uso: "noleggio", archiviato: false },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, patenteRichiesta: true, capienza: true, uso: true, stato: true },
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
      include: { boat: { select: { nome: true } } },
    }),
  ]);

  const prenotazioni = isSkipper
    ? bookings.map((b) => ({ ...b, prezzoCent: null, cauzioneCent: null, note: null }))
    : bookings;

  return ok({ from, to, boats, bookings: prenotazioni, blocks });
}
