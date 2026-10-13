import { fail, ok } from "@/lib/api";
import { registraAzione } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/modules/ormeggio/accesso";
import { addettoDelTenant } from "@/modules/piattaforma/riferimenti";
import { inizioGiorno, oggi } from "@/modules/piattaforma/date";
import { z } from "zod";
import { vociConto } from "@/modules/ormeggio/server/conto";

// Elenco attività: per permanenza (scheda) oppure trasversale (pagina «Da fare»).
export async function GET(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const url = new URL(req.url);
  const permanenzaId = url.searchParams.get("permanenzaId");
  const daFare = url.searchParams.get("daFare") === "1";
  const stato = z.enum(["da_fare", "in_corso", "completato"]).optional().safeParse(url.searchParams.get("stato") ?? undefined);
  if (!stato.success) return fail("Stato attività non valido", 422);
  const ordine = z.enum(["giorno", "priorita"]).default("priorita").safeParse(url.searchParams.get("ordine") ?? undefined);
  if (!ordine.success) return fail("Ordine attività non valido", 422);
  const completate = z.enum(["attuali", "archiviate"]).optional().safeParse(url.searchParams.get("completate") ?? undefined);
  if (!completate.success || (completate.data && (stato.data !== "completato" || daFare))) return fail("Filtro attività completate non valido", 422);
  const giorno = oggi();
  const confronto = completate.data === "archiviate" ? "lt" : "gte";
  const dataPrevista = { [confronto]: new Date(`${giorno}T00:00:00.000Z`) };
  const dataCompletamento = { [confronto]: inizioGiorno(giorno) };
  const attivita = await prisma.attivita.findMany({
    where: {
      tenantId: t.tenantId,
      ...(t.role !== "owner" && t.ruoloOrmeggio === "addetto" ? { addettoId: t.userId } : {}),
      ...(permanenzaId ? { permanenzaId } : { permanenza: { boat: { archiviato: false } } }),
      ...(daFare ? { stato: { in: ["da_fare", "in_corso"] } } : {}),
      ...(stato.data ? { stato: stato.data } : {}),
      ...(completate.data ? { OR: [
        { dataPrevista },
        { dataPrevista: null, completatoAt: dataCompletamento },
        { dataPrevista: null, completatoAt: null, createdAt: dataCompletamento },
      ] } : {}),
    },
    orderBy: stato.data === "completato" && completate.data !== "attuali" ? [{ completatoAt: "desc" }, { createdAt: "desc" }] : ordine.data === "giorno" ? [{ dataPrevista: { sort: "asc", nulls: "last" } }, { priorita: "desc" }, { createdAt: "asc" }] : [{ priorita: "desc" }, { dataPrevista: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    include: {
      addetto: { select: { id: true, nome: true } },
      addebito: { select: { id: true, stato: true } },
      permanenza: { include: { boat: { select: { nome: true, proprietario: { select: { nome: true } } } }, posto: { select: { codice: true } } } },
    },
    take: 200,
  });
  // Senza il permesso importi il prezzo dell'attività non compare.
  const voci = t.vedeImporti ? await vociConto(t.tenantId, attivita.filter((a) => a.addebito).map((a) => a.permanenzaId)) : new Map();
  const lista = attivita.map((a) => {
    // Stati chiari: inclusa nella custodia · da addebitare · già contabilizzata.
    const contabilizzata = !!a.addebito;
    const daAddebitare = !a.incluso && a.prezzoCent != null && !contabilizzata;
    const statoConto = a.incluso ? "inclusa" : contabilizzata ? "contabilizzata" : daAddebitare ? "da_addebitare" : "niente_da_addebitare";
    const voce = a.addebito ? voci.get(a.addebito.id) : null;
    const addebito = a.addebito && voce ? { ...a.addebito, stato: voce.stato, pagamentoPresente: voce.incassatoCent > 0 || a.addebito.stato === "pagato" } : a.addebito;
    const item = { ...a, addebito, ...(t.role !== "owner" && t.ruoloOrmeggio === "addetto" ? { permanenza: { ...a.permanenza, boat: { nome: a.permanenza.boat.nome, proprietario: null } } } : {}), contabilizzata, daAddebitare: t.role !== "owner" && t.ruoloOrmeggio === "addetto" ? false : daAddebitare, statoConto };
    return t.vedeImporti === false ? { ...item, prezzoCent: null } : item;
  });
  return ok(lista);
}

const Schema = z.object({
  permanenzaId: z.string().uuid(),
  tipo: z.string().min(1).max(80),
  priorita: z.number().int().min(1).max(3).default(2),
  dataPrevista: z.string().nullable().optional(),
  quantita: z.number().min(0).max(100000).optional().nullable(),
  unita: z.string().max(20).optional().nullable(),
  prezzoCent: z.number().int().min(0).max(100000000).optional().nullable(),
  incluso: z.boolean().optional(),
  addettoId: z.string().uuid().optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
});

export async function POST(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati attività non validi", 422);
  // Indicare un prezzo è un'operazione economica: serve il permesso importi.
  if (p.data.prezzoCent !== undefined && t.vedeImporti === false) return fail("Permesso negato: non hai l'accesso agli importi", 403);
  const perm = await prisma.permanenza.findFirst({ where: { id: p.data.permanenzaId, tenantId: t.tenantId, boat: { archiviato: false } } });
  if (!perm) return fail("Permanenza non trovata", 404);
  if (p.data.addettoId && !(await addettoDelTenant(t.tenantId, p.data.addettoId))) return fail("Addetto non valido per questa azienda", 422);
  let dataPrevista: Date | null = null;
  if (p.data.dataPrevista) {
    dataPrevista = new Date(p.data.dataPrevista);
    if (Number.isNaN(dataPrevista.getTime())) return fail("Data prevista non valida", 422);
  }
  const attivita = await prisma.attivita.create({
    data: {
      tenantId: t.tenantId,
      permanenzaId: perm.id,
      tipo: p.data.tipo.trim(),
      priorita: p.data.priorita,
      dataPrevista,
      quantita: p.data.quantita ?? null,
      unita: p.data.unita?.trim() || null,
      prezzoCent: p.data.prezzoCent ?? null,
      incluso: p.data.incluso ?? false,
      addettoId: p.data.addettoId ?? null,
      note: p.data.note?.trim() || null,
    },
  });
  await registraAzione({ tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.attivita.crea", entita: "Attivita", entitaId: attivita.id, nota: attivita.tipo });
  return ok(attivita, 201);
}
