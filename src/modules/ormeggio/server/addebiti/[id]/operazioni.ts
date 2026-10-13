import { fail, ok } from "@/lib/api";
import { registraAzione } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { requireImporti } from "@/modules/ormeggio/accesso";
import { z } from "zod";
import { contoPermanenza } from "@/modules/ormeggio/server/conto";
import { giornoDi, inizioGiorno, oggi } from "@/modules/piattaforma/date";

const Schema = z.object({
  stato: z.enum(["da_pagare", "pagato"]).optional(),
  descrizione: z.string().min(1).max(160).optional(),
  importoCent: z.number().int().min(0).max(100000000).optional(),
  metodo: z.enum(["contanti", "pos", "bonifico", "manuale"]).optional(),
  dataIncasso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => { try { return giornoDi(inizioGiorno(d)) === d && d <= oggi(); } catch { return false; } }).optional(),
  incassoAttesoCent: z.number().int().min(0).max(100000000).optional(),
}).strict().refine((d) => (d.stato === "pagato" || d.metodo === undefined && d.dataIncasso === undefined && d.incassoAttesoCent === undefined) && !(d.stato === "pagato" && d.importoCent !== undefined));

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireImporti(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati addebito non validi", 422);
  const ad = await prisma.addebito.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!ad) return fail("Addebito non trovato", 404);
  const conto = await contoPermanenza(t.tenantId, ad.permanenzaId);
  const voce = conto.addebiti.find((a) => a.id === ad.id)!;
  if (p.data.importoCent !== undefined && p.data.importoCent !== ad.importoCent && (voce.incassatoCent > 0 || ad.stato === "pagato")) return fail("Addebito già incassato: conserva lo storico e registra una rettifica separata", 409);
  if (p.data.stato === "da_pagare" && voce.incassatoCent > 0) return fail("L'addebito è coperto da incassi registrati: non puoi riaprirlo cambiando solo lo stato", 409);
  const importoCent = p.data.importoCent ?? ad.importoCent;
  const daIncassareCent = Math.max(0, importoCent - voce.incassatoCent);
  if (p.data.stato === "pagato" && p.data.incassoAttesoCent !== undefined && p.data.incassoAttesoCent !== daIncassareCent) return fail("Il conto è cambiato. Aggiorna la scheda e verifica l'importo prima di registrare l'incasso", 409);
  let incasso = null;
  if (p.data.stato === "pagato" && daIncassareCent > 0) {
    incasso = await prisma.payment.create({ data: {
      tenantId: t.tenantId, permanenzaId: ad.permanenzaId, addebitoId: ad.id,
      provider: "manuale", tipo: "totale", stato: "pagato",
      importoCent: daIncassareCent, totaleCent: daIncassareCent,
      metodo: p.data.metodo ?? "manuale", descrizione: p.data.descrizione ?? ad.descrizione,
      paidAt: p.data.dataIncasso && p.data.dataIncasso !== oggi() ? inizioGiorno(p.data.dataIncasso) : new Date(),
    } });
    await prisma.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.incasso.addebito", entita: "Payment", entitaId: incasso.id, dettagli: JSON.stringify({ addebitoId: ad.id, permanenzaId: ad.permanenzaId, importoCent: daIncassareCent, metodo: incasso.metodo, paidAt: incasso.paidAt }) } });
  }
  const aggiornato = await prisma.addebito.update({ where: { id: ad.id, tenantId: t.tenantId }, data: {
    ...(p.data.stato !== undefined ? { stato: p.data.stato } : {}),
    ...(p.data.descrizione !== undefined ? { descrizione: p.data.descrizione } : {}),
    ...(p.data.importoCent !== undefined ? { importoCent: p.data.importoCent } : {}),
  } });
  await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.addebito.modifica", entita: "Addebito", entitaId: ad.id, nota: ad.descrizione });
  return ok({ ...aggiornato, incasso, incassoCreatoCent: incasso?.totaleCent ?? 0 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireImporti(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const ad = await prisma.addebito.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!ad) return fail("Addebito non trovato", 404);
  const conto = await contoPermanenza(t.tenantId, ad.permanenzaId);
  if (ad.stato === "pagato" || conto.addebiti.find((a) => a.id === ad.id)!.incassatoCent > 0 || await prisma.payment.count({ where: { tenantId: t.tenantId, addebitoId: ad.id } })) return fail("Addebito già collegato a incassi: conserva lo storico e registra una rettifica separata", 409);
  await prisma.addebito.delete({ where: { id: ad.id } });
  await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.addebito.elimina", entita: "Addebito", entitaId: ad.id, nota: ad.descrizione });
  return ok({ ok: true });
}
