import { ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/modules/ormeggio/accesso";
import { SERVIZI_ORMEGGIO } from "@/modules/ormeggio/servizi";

export async function POST(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const aggiunti = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${t.tenantId} FOR UPDATE`;
    const tenant = await tx.tenant.findUnique({ where: { id: t.tenantId }, select: { catalogoOrmeggioInizializzato: true } });
    if (tenant?.catalogoOrmeggioInizializzato) return 0;
    const presenti = await tx.servizioCatalogo.findMany({ where: { tenantId: t.tenantId }, select: { nome: true } });
    const nomi = new Set(presenti.map((s) => s.nome.trim().toLocaleLowerCase("it-IT")));
    const nuovi = SERVIZI_ORMEGGIO.filter(([nome]) => !nomi.has(nome.toLocaleLowerCase("it-IT")));
    await tx.servizioCatalogo.createMany({ data: nuovi.map(([nome, unita]) => ({ tenantId: t.tenantId, nome, unita, prezzoCent: null, predefinito: true })) });
    await tx.tenant.update({ where: { id: t.tenantId }, data: { catalogoOrmeggioInizializzato: true } });
    await tx.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.servizi.predefiniti", entita: "ServizioCatalogo", dettagli: JSON.stringify({ aggiunti: nuovi.length }) } });
    return nuovi.length;
  });
  return ok({ aggiunti });
}
