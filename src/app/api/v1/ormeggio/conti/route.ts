import { ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireImporti } from "@/lib/ormeggio";

// Conti per proprietario: somma di addebiti e incassi di tutte le sue barche.
export async function GET(req: Request) {
  const t = await requireImporti(req);
  if ("error" in t) return t.error;
  const proprietari = await prisma.proprietario.findMany({
    where: { tenantId: t.tenantId },
    orderBy: { nome: "asc" },
    include: { boats: { include: { permanenze: { include: { addebiti: true, payments: true } } } } },
  });
  const conti = proprietari.map((pr) => {
    let addebitiCent = 0;
    let incassatoCent = 0;
    let permanenze = 0;
    let aperte = 0;
    const dettaglio: any[] = [];
    for (const b of pr.boats) {
      for (const p of b.permanenze) {
        permanenze += 1;
        if (p.stato === "attiva") aperte += 1;
        const ad = p.addebiti.reduce((s, a) => s + a.importoCent, 0);
        const inc = p.payments.filter((x) => x.stato === "pagato").reduce((s, x) => s + x.totaleCent, 0);
        addebitiCent += ad;
        incassatoCent += inc;
        dettaglio.push({
          permanenzaId: p.id,
          boat: b.nome,
          tipo: p.tipo,
          stato: p.stato,
          finePrevistaAt: p.finePrevistaAt,
          addebitiCent: ad,
          incassatoCent: inc,
          residuoCent: Math.max(0, ad - inc),
        });
      }
    }
    return {
      id: pr.id,
      nome: pr.nome,
      telefono: pr.telefono,
      email: pr.email,
      barche: pr.boats.length,
      permanenze,
      aperte,
      addebitiCent,
      incassatoCent,
      residuoCent: Math.max(0, addebitiCent - incassatoCent),
      dettaglio,
    };
  });
  return ok(conti);
}
