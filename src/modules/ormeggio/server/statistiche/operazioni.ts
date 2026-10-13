import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireImporti } from "@/modules/ormeggio/accesso";
import { aggiungiGiorni, oggi } from "@/modules/piattaforma/date";
import { calcolaStatistiche } from "@/modules/ormeggio/statistiche/calcoli";

const giorno = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => { const d = new Date(`${v}T12:00:00Z`); return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === v; });
function annoPrima(g: string) {
  const [y, m, d] = g.split("-").map(Number);
  return `${y - 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, new Date(Date.UTC(y - 1, m, 0)).getUTCDate())).padStart(2, "0")}`;
}
export async function GET(req: Request) {
  const t = await requireImporti(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams;
  const today = oggi();
  const p = z.object({ dal: giorno.default(`${today.slice(0, 7)}-01`), al: giorno.default(today), areaId: z.string().uuid().optional(), tipo: z.enum(["ormeggio_custodia", "rimessaggio_custodia"]).optional(), categoria: z.enum(["saldati", "parziali", "da_saldare"]).optional(), dettaglio: z.enum(["incassi", "residui", "occupazione", "contratti"]).optional(), pagina: z.coerce.number().int().min(1).max(100000).default(1) }).refine((f) => !f.categoria || !f.dettaglio).safeParse(Object.fromEntries(q));
  if (!p.success) return fail("Filtri statistiche non validi", 422);
  const f = p.data;
  const giorni = Math.round((+new Date(f.al) - +new Date(f.dal)) / 86400000) + 1;
  if (giorni < 1 || giorni > 1096) return fail("Scegli un intervallo da 1 a 1096 giorni", 422);
  const [aree, permanenze, indisponibilita] = await Promise.all([
    prisma.area.findMany({ where: { tenantId: t.tenantId }, select: { id: true, nome: true, archiviata: true, posti: { where: { tenantId: t.tenantId, rimossoAt: null }, select: { id: true, areaId: true, codice: true, createdAt: true, area: { select: { id: true, nome: true } } } } }, orderBy: [{ ordine: "asc" }, { id: "asc" }] }),
    prisma.permanenza.findMany({ where: { tenantId: t.tenantId, boat: { uso: "custodia" } }, select: {
      id: true, stato: true, tipo: true, inizioAt: true, fineAt: true, finePrevistaAt: true, corrispettivoCent: true,
      boat: { select: { nome: true, proprietario: { select: { nome: true } } } },
      assegnazioni: { where: { tenantId: t.tenantId }, select: { dal: true, al: true, postoId: true, posto: { select: { areaId: true } } } },
      addebiti: { where: { tenantId: t.tenantId }, select: { importoCent: true, origine: true } },
      payments: { where: { tenantId: t.tenantId }, select: { id: true, tipo: true, stato: true, totaleCent: true, rimborsoCent: true, paidAt: true, condizioniSnapshot: true, refunds: { where: { tenantId: t.tenantId }, select: { importoCent: true, stato: true, completatoAt: true } } } },
    } }),
    prisma.indisponibilitaPosto.findMany({ where: { tenantId: t.tenantId }, select: { postoId: true, dal: true, al: true } }),
  ]);
  if (f.areaId && !aree.some((a) => a.id === f.areaId)) return fail("Area non trovata", 404);
  const areeAttive = aree.filter((a) => !a.archiviata);
  if (f.areaId && (!areeAttive.some((a) => a.id === f.areaId) || areeAttive.length < 2)) f.areaId = undefined;
  const dati = { posti: areeAttive.flatMap((a) => a.posti), permanenze, indisponibilita };
  const now = new Date();
  const corrente = calcolaStatistiche(dati, f, now);
  if (f.dettaglio) {
    const lista = corrente.composizione[f.dettaglio];
    return ok({ dettaglio: f.dettaglio, periodo: corrente.periodo, metriche: corrente.metriche, copertura: corrente.copertura, totale: lista.length, pagina: f.pagina, perPagina: 20, righe: lista.slice((f.pagina - 1) * 20, f.pagina * 20), aggiornatoAt: now, areaIdEffettiva: f.areaId ?? "" });
  }
  if (f.categoria) {
    const lista = corrente.dettagli.filter((d) => d.categoria === f.categoria);
    return ok({ categoria: f.categoria, metriche: corrente.metriche, copertura: corrente.copertura, totale: lista.length, pagina: f.pagina, perPagina: 20, righe: lista.slice((f.pagina - 1) * 20, f.pagina * 20).map((d) => ({ ...d, permanenzaId: d.id, titolo: d.barca, sottotitolo: d.proprietario, addebitatoCent: d.valoreCent, pagatoCent: d.incassatoCent })), aggiornatoAt: now, areaIdEffettiva: f.areaId ?? "" });
  }
  const precedente = calcolaStatistiche(dati, { ...f, dal: aggiungiGiorni(f.dal, -giorni), al: aggiungiGiorni(f.dal, -1) }, now);
  const anno = calcolaStatistiche(dati, { ...f, dal: annoPrima(f.dal), al: annoPrima(f.al) }, now);
  const { dettagli: _d, composizione: _c, ...dashboard } = corrente;
  const righeAree = areeAttive.filter((a) => !f.areaId || a.id === f.areaId).map((a) => corrente.aree.find((r) => r.id === a.id) ?? { id: a.id, nome: a.nome, disponibili: 0, riservati: 0, valoreCent: 0, nettiCent: 0, occupazione: null, resaCent: null });
  return ok({ ...dashboard, aree: righeAree, areaIdEffettiva: f.areaId ?? "", confronto: { precedente: { periodo: precedente.periodo, metriche: precedente.metriche }, anno: { periodo: anno.periodo, metriche: anno.metriche } }, areeFiltro: areeAttive.map(({ id, nome }) => ({ id, nome })), aggiornatoAt: now, situazioneContiAt: now, baseCapacita: "L’occupazione riguarda soltanto le aree e i posti ancora presenti nel profilo. Ogni posto contribuisce dalla sua creazione, sottraendo i periodi di indisponibilità registrati. I blocchi precedenti all’attivazione dello storico potrebbero non essere ricostruibili." });
}
