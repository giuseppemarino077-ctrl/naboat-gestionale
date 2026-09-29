import { ok } from "@/lib/api";
import { fineGiorno, inizioGiorno, oggi } from "@/lib/calendario";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

// Cruscotto Oggi da DB: uscite, rientri, barche bloccate, attenzioni, prossime partenze.
// I confini del giorno sono quelli civili di Europe/Rome, non dell'ora del server.
export async function GET(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const dayStart = inizioGiorno(oggi());
  const dayEnd = fineGiorno(oggi());

  // Se chi guarda è uno skipper, vede solo le sue uscite.
  let soloMio: string | null = null;
  if (t.role === "skipper") {
    const suo = await prisma.skipper.findFirst({ where: { tenantId: t.tenantId, userId: t.userId }, select: { id: true } });
    soloMio = suo?.id ?? "nessuno";
  }
  const filtroSkipper = soloMio ? { skipperId: soloMio } : {};

  const [uscite, rientri, blocchi, manutenzioni, partenze] = await Promise.all([
    prisma.booking.count({ where: { tenantId: t.tenantId, stato: { in: ["prenotata", "in_mare"] }, startAt: { gte: dayStart, lte: dayEnd }, ...filtroSkipper } }),
    prisma.booking.count({ where: { tenantId: t.tenantId, stato: { in: ["in_mare", "rientrata"] }, endAt: { gte: dayStart, lte: dayEnd }, ...filtroSkipper } }),
    soloMio ? Promise.resolve(0) : prisma.block.count({ where: { tenantId: t.tenantId, startAt: { lt: dayEnd }, endAt: { gt: dayStart } } }),
    soloMio ? Promise.resolve(0) : prisma.boat.count({ where: { tenantId: t.tenantId, stato: "manutenzione" } }),
    prisma.booking.findMany({
      where: { tenantId: t.tenantId, stato: { in: ["prenotata", "in_mare"] }, startAt: { gte: dayStart, lte: dayEnd }, ...filtroSkipper },
      orderBy: { startAt: "asc" },
      take: 8,
      // Solo i campi mostrati dal cruscotto: nessuna lettura inutile.
      select: {
        id: true,
        startAt: true,
        stato: true,
        clienteNome: true,
        destinazione: true,
        telefono: true,
        prezzoCent: true,
        cauzioneStato: true,
        checkinAt: true,
        checkoutAt: true,
        contrattoFirmatoAt: true,
        boat: { select: { nome: true } },
      },
    }),
  ]);

  return ok({
    uscite,
    rientri,
    barcheBloccate: blocchi,
    attenzioni: manutenzioni + blocchi,
    partenze: partenze.map((b) => ({
      id: b.id,
      ora: b.startAt.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }),
      barca: b.boat.nome,
      cliente: b.clienteNome,
      dest: b.destinazione,
      stato: b.stato === "in_mare" ? "In mare" : "Pronta",
      checkinFatto: !!b.checkinAt,
      checkoutFatto: !!b.checkoutAt,
      contrattoFirmato: !!b.contrattoFirmatoAt,
      telefono: b.telefono,
      prezzoCent: b.prezzoCent,
      cauzioneStato: b.cauzioneStato,
    })),
  });
}
