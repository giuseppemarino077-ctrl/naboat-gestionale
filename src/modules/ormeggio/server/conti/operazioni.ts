import { ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { riepilogoConto } from "@/modules/ormeggio/conto";
import { requireImporti } from "@/modules/ormeggio/accesso";

// Conti per proprietario: somma di addebiti e incassi di tutte le sue barche.
export async function GET(req: Request) {
  const t = await requireImporti(req);
  if ("error" in t) return t.error;
  const proprietari = await prisma.proprietario.findMany({
    where: { tenantId: t.tenantId },
    orderBy: { nome: "asc" },
    include: { boats: { where: { tenantId: t.tenantId, uso: "custodia" }, include: { permanenze: { where: { tenantId: t.tenantId }, include: { addebiti: { where: { tenantId: t.tenantId } }, payments: { where: { tenantId: t.tenantId }, include: { refunds: { where: { tenantId: t.tenantId } } } } } } } } },
  });
  const conti = proprietari.map((pr) => {
    let addebitiCent = 0;
    let incassatoCent = 0;
    let residuoCent = 0;
    let creditoCent = 0;
    let permanenze = 0;
    let aperte = 0;
    const dettaglio: any[] = [];
    for (const b of pr.boats) {
      for (const p of b.permanenze) {
        permanenze += 1;
        if (p.stato === "attiva") aperte += 1;
        const conto = riepilogoConto(p.addebiti, p.payments);
        const ad = conto.totaleAddebitiCent;
        const inc = conto.incassatoCent;
        residuoCent += conto.residuoCent;
        creditoCent += conto.creditoCent;
        addebitiCent += ad;
        incassatoCent += inc;
        dettaglio.push({
          permanenzaId: p.id,
          boat: b.nome,
          tipo: p.tipo,
          stato: p.stato,
          finePrevistaAt: p.finePrevistaAt,
          inizioAt: p.inizioAt,
          addebitiCent: ad,
          incassatoCent: inc,
          residuoCent: conto.residuoCent,
          creditoCent: conto.creditoCent,
        });
      }
    }
    return {
      id: pr.id,
      nome: pr.nome,
      archiviato: pr.archiviato,
      telefono: pr.telefono,
      email: pr.email,
      barche: pr.boats.length,
      permanenze,
      aperte,
      addebitiCent,
      incassatoCent,
      residuoCent,
      creditoCent,
      dettaglio,
    };
  });
  return ok(conti);
}
