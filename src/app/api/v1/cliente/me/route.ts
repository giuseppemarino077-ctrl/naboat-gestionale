import { ok } from "@/lib/api";
import { requireCliente } from "@/lib/clienti";
import { prisma } from "@/lib/db";

// Dati dell'area personale: account, patente (senza numero) e prenotazioni.
export async function GET() {
  const g = await requireCliente();
  if ("error" in g) return g.error;

  const [patente, bookings] = await Promise.all([
    prisma.patenteNautica.findUnique({ where: { accountId: g.account.id }, select: { stato: true, motivoRifiuto: true, fotoUrl: true, updatedAt: true } }),
    prisma.booking.findMany({
      where: { clienteAccountId: g.account.id },
      orderBy: { startAt: "desc" },
      take: 100,
      include: {
        boat: { select: { nome: true, tipo: true, porto: { select: { nome: true, indirizzo: true, lat: true, lon: true } } } },
        tenant: { select: { nome: true, telefonoContatto: true, slug: true } },
        payments: { select: { stato: true, totaleCent: true } },
      },
    }),
  ]);

  const ora = new Date();
  const prenotazioni = bookings.map((b) => {
    const pagato = b.payments.filter((p) => p.stato === "pagato").reduce((s, p) => s + p.totaleCent, 0);
    return {
      id: b.id,
      stato: b.stato,
      startAt: b.startAt,
      endAt: b.endAt,
      passeggeri: b.passeggeri,
      prezzoCent: b.prezzoCent,
      pagatoCent: pagato,
      residuoCent: Math.max(0, (b.prezzoCent ?? 0) - pagato),
      boat: b.boat ? { nome: b.boat.nome, tipo: b.boat.tipo, porto: b.boat.porto } : null,
      azienda: { nome: b.tenant.nome, telefono: b.tenant.telefonoContatto, slug: b.tenant.slug },
    };
  });

  return ok({
    account: { id: g.account.id, nome: g.account.nome, email: g.account.email, telefono: g.account.telefono },
    patente,
    future: prenotazioni.filter((p) => new Date(p.endAt) >= ora && p.stato !== "cancellata"),
    passate: prenotazioni.filter((p) => new Date(p.endAt) < ora || p.stato === "cancellata"),
  });
}
