import { ok } from "@/lib/api";
import { patenteValida, requireCliente } from "@/lib/clienti";
import { prisma } from "@/lib/db";
import { calcolaResiduoPrezzo } from "@/lib/payments";

// Dati dell'area personale: account, patente (senza numero) e prenotazioni.
export async function GET() {
  const g = await requireCliente();
  if ("error" in g) return g.error;

  const [patente, bookings] = await Promise.all([
    prisma.patenteNautica.findUnique({ where: { accountId: g.account.id }, select: { stato: true, motivoRifiuto: true, fotoUrl: true, scadenzaAt: true, updatedAt: true } }),
    prisma.booking.findMany({
      where: { clienteAccountId: g.account.id },
      orderBy: { startAt: "desc" },
      take: 100,
      include: {
        boat: { select: { nome: true, tipo: true, porto: { select: { nome: true, indirizzo: true, lat: true, lon: true } } } },
        tenant: { select: { nome: true, telefonoContatto: true, slug: true } },
        payments: {
          select: {
            id: true,
            stato: true,
            provider: true,
            tipo: true,
            importoCent: true,
            feeNaboatCent: true,
            feeProviderCent: true,
            totaleCent: true,
            rimborsoCent: true,
            sessionId: true,
            paymentIntentId: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  const ora = new Date();
  const prenotazioni = bookings.map((b) => {
    // Stesse allocazioni del gestionale: prezzo meno capitale incassato (senza fee
    // né cauzione) e al netto dei rimborsi. Un rimborso parziale non azzera il saldo.
    const residuo = calcolaResiduoPrezzo(b.prezzoCent ?? 0, b.payments, { cauzioneIntentId: b.cauzioneIntentId });
    return {
      id: b.id,
      stato: b.stato,
      startAt: b.startAt,
      endAt: b.endAt,
      passeggeri: b.passeggeri,
      prezzoCent: b.prezzoCent,
      pagatoCent: residuo.capitaleIncassatoCent,
      rimborsatoCent: residuo.rimborsatoCent,
      residuoCent: residuo.residuoCent,
      boat: b.boat ? { nome: b.boat.nome, tipo: b.boat.tipo, porto: b.boat.porto } : null,
      azienda: { nome: b.tenant.nome, telefono: b.tenant.telefonoContatto, slug: b.tenant.slug },
    };
  });

  return ok({
    account: { id: g.account.id, nome: g.account.nome, email: g.account.email, telefono: g.account.telefono },
    // "valida" è calcolata: approvata e non scaduta. L'attestazione manuale non compare qui.
    patente: patente ? { ...patente, valida: patenteValida(patente) } : null,
    future: prenotazioni.filter((p) => new Date(p.endAt) >= ora && p.stato !== "cancellata"),
    passate: prenotazioni.filter((p) => new Date(p.endAt) < ora || p.stato === "cancellata"),
  });
}
