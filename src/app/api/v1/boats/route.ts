import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { CODICI_ESPERIENZA } from "@/lib/esperienze";
import { motivoNonIdonea } from "@/lib/marketplace";
import { bloccaPiano } from "@/lib/piani";
import { portoDelTenant, modelloValido } from "@/lib/riferimenti";
import { finalizzaRimozioni } from "@/lib/rimozione-barche";
import { rigeneraBarca } from "@/lib/seo";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  // Finalizzazione idempotente delle rimozioni differite scadute (nessuna dipendenza
  // da un timer del browser o da un cron dedicato).
  await finalizzaRimozioni(t.tenantId).catch(() => {});
  // Le barche da noleggio e quelle in custodia sono due mondi separati: di default
  // si mostrano quelle da noleggio (comportamento di sempre), le altre si chiedono con ?uso=custodia.
  const uso = new URL(req.url).searchParams.get("uso") ?? "noleggio";
  const archiviate = new URL(req.url).searchParams.get("archiviate") === "1";
  const filtro = uso === "tutte" ? {} : { uso: uso === "custodia" ? ("custodia" as const) : ("noleggio" as const) };
  const boats = await prisma.boat.findMany({
    where: { tenantId: t.tenantId, ...filtro, archiviato: archiviate },
    orderBy: { nome: "asc" },
    include: { porto: { select: { id: true, nome: true } }, modello: { select: { id: true, modello: true, marca: true } } },
  });
  return ok(boats);
}

const Schema = z.object({
  nome: z.string().min(2).max(160),
  tipo: z.string().max(40).optional(),
  // Capacità ignota esplicita: null = da configurare, nessun numero fittizio.
  capienza: z.number().int().min(1).max(60).optional().nullable(),
  // Potenza decimale (es. 40,5 CV).
  potenzaCv: z.number().min(0).max(100000).optional().nullable(),
  codiceInterno: z.string().max(80).optional().nullable(),
  patenteRichiesta: z.boolean().default(false),
  stato: z.enum(["disponibile", "non_disponibile", "manutenzione"]).default("disponibile"),
  uso: z.enum(["noleggio", "custodia"]).default("noleggio"),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lon: z.number().min(-180).max(180).optional().nullable(),
  portoId: z.string().uuid().optional().nullable(),
  modelloId: z.string().uuid().optional().nullable(),
  descrizione: z.string().max(3000).optional().nullable(),
  lunghezzaM: z.number().min(0).max(200).optional().nullable(),
  cabine: z.number().int().min(0).max(30).optional().nullable(),
  dotazioni: z.array(z.string().max(60)).max(40).optional(),
  esperienze: z.array(z.string().max(40)).max(40).optional(),
  esperienzePersonalizzate: z.array(z.string().max(80)).max(20).optional(),
  carburante: z.string().max(80).optional().nullable(),
  cauzioneCent: z.number().int().min(0).max(100000000).optional().nullable(),
  etaMinima: z.number().int().min(0).max(99).optional().nullable(),
  pubblicata: z.boolean().optional(),
  inPausa: z.boolean().optional(),
});

export async function POST(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati barca non validi", 422);
  if (p.data.portoId && !(await portoDelTenant(t.tenantId, p.data.portoId))) return fail("Porto non valido per questa azienda", 422);
  if (p.data.modelloId && !(await modelloValido(p.data.modelloId))) return fail("Modello non valido", 422);
  if (p.data.esperienze && p.data.esperienze.some((c) => !CODICI_ESPERIENZA.has(c))) return fail("Esperienza non valida", 422);
  if (p.data.esperienzePersonalizzate) {
    p.data.esperienzePersonalizzate = Array.from(new Set(p.data.esperienzePersonalizzate.map((s) => s.trim()).filter(Boolean)));
  }
  if (p.data.esperienze || p.data.esperienzePersonalizzate) {
    const ten = await prisma.tenant.findUnique({ where: { id: t.tenantId }, select: { esperienzeAttive: true, esperienzePersonalizzate: true } });
    const attive = new Set(ten?.esperienzeAttive ?? []);
    const custom = new Set(ten?.esperienzePersonalizzate ?? []);
    if (p.data.esperienze?.some((c) => !attive.has(c))) return fail("Esperienza non attiva per questa azienda", 422);
    if (p.data.esperienzePersonalizzate?.some((s) => !custom.has(s))) return fail("Esperienza personalizzata non valida", 422);
  }

  // M01: la creazione segue la stessa regola della modifica. Un azienda con il
  // marketplace spento non può nemmeno creare una barca già pubblicata.
  if (p.data.pubblicata === true) {
    const tenant = await prisma.tenant.findUnique({ where: { id: t.tenantId }, select: { status: true, moduloMarketplace: true } });
    const motivo = motivoNonIdonea({
      uso: p.data.uso,
      archiviato: false,
      pubblicata: true,
      inPausa: p.data.inPausa ?? false,
      bloccataAdmin: false,
      fotoCopertina: null,
      fotoGallery: [],
      tariffeAttive: 0,
      aziendaStatus: tenant?.status ?? "pending",
      moduloMarketplace: tenant?.moduloMarketplace ?? false,
    });
    return fail(motivo ?? "Per pubblicare serve almeno una foto e un prezzo nel listino", motivo?.includes("Marketplace") ? 403 : 422);
  }

  const boat = await prisma.$transaction(async (tx) => {
    await bloccaPiano(tx, t.tenantId);
    return tx.boat.create({ data: { tenantId: t.tenantId, ...p.data } });
  });
  await prisma.auditLog.create({
    data: { tenantId: t.tenantId, actorId: t.userId, azione: "boat.create", entita: "Boat", entitaId: boat.id },
  });
  // Prepara la pagina pubblica (SEO) della barca dai dati reali.
  await rigeneraBarca(boat.id).catch(() => {});
  return ok(boat, 201);
}
