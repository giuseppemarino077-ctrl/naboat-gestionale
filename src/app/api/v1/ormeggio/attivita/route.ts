import { fail, ok } from "@/lib/api";
import { registraAzione } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/lib/ormeggio";
import { addettoDelTenant } from "@/lib/riferimenti";
import { z } from "zod";

// Elenco attività: per permanenza (scheda) oppure trasversale (pagina «Da fare»).
export async function GET(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;
  const url = new URL(req.url);
  const permanenzaId = url.searchParams.get("permanenzaId");
  const daFare = url.searchParams.get("daFare") === "1";
  const attivita = await prisma.attivita.findMany({
    where: {
      tenantId: t.tenantId,
      ...(permanenzaId ? { permanenzaId } : {}),
      ...(daFare ? { stato: { in: ["da_fare", "in_corso"] } } : {}),
    },
    orderBy: [{ dataPrevista: "asc" }, { createdAt: "asc" }],
    include: {
      addetto: { select: { id: true, nome: true } },
      permanenza: { include: { boat: { select: { nome: true } }, posto: { select: { codice: true } } } },
    },
    take: 200,
  });
  // Senza il permesso importi il prezzo dell'attività non compare.
  const lista = t.vedeImporti === false ? attivita.map((a) => ({ ...a, prezzoCent: null })) : attivita;
  return ok(lista);
}

const Schema = z.object({
  permanenzaId: z.string().uuid(),
  tipo: z.string().min(1).max(80),
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
  const perm = await prisma.permanenza.findFirst({ where: { id: p.data.permanenzaId, tenantId: t.tenantId } });
  if (!perm) return fail("Permanenza non trovata", 404);
  if (p.data.addettoId && !(await addettoDelTenant(t.tenantId, p.data.addettoId))) return fail("Addetto non valido per questa azienda", 422);
  const attivita = await prisma.attivita.create({
    data: {
      tenantId: t.tenantId,
      permanenzaId: perm.id,
      tipo: p.data.tipo.trim(),
      dataPrevista: p.data.dataPrevista ? new Date(p.data.dataPrevista) : null,
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
