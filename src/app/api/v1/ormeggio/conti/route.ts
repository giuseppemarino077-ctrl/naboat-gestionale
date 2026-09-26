import { ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/lib/ormeggio";

// Conti per proprietario: somma di addebiti e incassi di tutte le sue barche.
export async function GET(req: Request) {
  const t = await requireOrmeggio(req);
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
    for (const b of pr.boats) {
      for (const p of b.permanenze) {
        permanenze += 1;
        if (p.stato === "attiva") aperte += 1;
        addebitiCent += p.addebiti.reduce((s, a) => s + a.importoCent, 0);
        incassatoCent += p.payments.filter((x) => x.stato === "pagato").reduce((s, x) => s + x.totaleCent, 0);
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
    };
  });
  return ok(conti);
}
