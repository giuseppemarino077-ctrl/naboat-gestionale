import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { rigeneraBarca } from "@/lib/seo";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
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
  nome: z.string().min(2).max(120),
  tipo: z.string().max(40).optional(),
  capienza: z.number().int().min(1).max(60).default(2),
  potenzaCv: z.number().int().min(0).max(2000).optional(),
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
  const boat = await prisma.boat.create({ data: { tenantId: t.tenantId, ...p.data } });
  await prisma.auditLog.create({
    data: { tenantId: t.tenantId, actorId: t.userId, azione: "boat.create", entita: "Boat", entitaId: boat.id },
  });
  // Prepara la pagina pubblica (SEO) della barca dai dati reali.
  await rigeneraBarca(boat.id).catch(() => {});
  return ok(boat, 201);
}
