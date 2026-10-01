import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { CATALOGO_PREDEFINITO } from "@/lib/dotazioni";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

async function barca(tenantId: string, id: string) {
  return prisma.boat.findFirst({ where: { id, tenantId }, select: { id: true, dotazioni: true } });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const b = await barca(t.tenantId, id);
  if (!b) return fail("Barca non trovata", 404);
  const [catalogo, associazioni] = await Promise.all([
    prisma.dotazione.findMany({ where: { tenantId: t.tenantId }, orderBy: [{ categoria: "asc" }, { ordine: "asc" }, { nome: "asc" }] }),
    prisma.boatDotazione.findMany({ where: { tenantId: t.tenantId, boatId: id }, select: { dotazioneId: true, nota: true } }),
  ]);
  return ok({
    catalogo: catalogo.length ? catalogo : CATALOGO_PREDEFINITO.map((d, i) => ({ id: null, nome: d.nome, categoria: d.categoria, descrizione: d.descrizione ?? null, ordine: i })),
    associazioni,
    legacy: b.dotazioni,
  });
}

const Schema = z.object({
  voci: z.array(z.object({
    nome: z.string().min(1).max(120),
    categoria: z.enum(["NAVIGATION", "COMFORT", "ENTERTAINMENT", "KITCHEN", "ELECTRICAL", "WATER_SPORTS", "OTHER"]).default("OTHER"),
    nota: z.string().max(300).optional().nullable(),
  })).max(80),
}).strict();

// Salva le dotazioni incluse: crea al volo le voci di catalogo mancanti, aggiorna
// le associazioni con nota e sincronizza Boat.dotazioni per la scheda pubblica,
// conservando le voci legacy non riconosciute.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const b = await barca(t.tenantId, id);
  if (!b) return fail("Barca non trovata", 404);
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati dotazioni non validi", 422);

  const risultato = await prisma.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const voce of p.data.voci) {
      const dot = await tx.dotazione.upsert({
        where: { tenantId_nome: { tenantId: t.tenantId, nome: voce.nome } },
        update: { categoria: voce.categoria },
        create: { tenantId: t.tenantId, nome: voce.nome, categoria: voce.categoria },
      });
      ids.push(dot.id);
      await tx.boatDotazione.upsert({
        where: { boatId_dotazioneId: { boatId: id, dotazioneId: dot.id } },
        update: { nota: voce.nota ?? null },
        create: { tenantId: t.tenantId, boatId: id, dotazioneId: dot.id, nota: voce.nota ?? null },
      });
    }
    await tx.boatDotazione.deleteMany({ where: { tenantId: t.tenantId, boatId: id, dotazioneId: { notIn: ids } } });

    // Voci legacy non riconosciute: non si perdono nella scheda pubblica.
    const nomiCatalogo = new Set((await tx.dotazione.findMany({ where: { tenantId: t.tenantId }, select: { nome: true } })).map((d) => d.nome));
    const legacy = (b.dotazioni ?? []).filter((s) => !nomiCatalogo.has(s));
    const uniti = [...new Set([...p.data.voci.map((v) => v.nome), ...legacy])];
    await tx.boat.update({ where: { id }, data: { dotazioni: uniti } });
    return { salvate: ids.length, legacy: legacy.length };
  });

  return ok(risultato);
}
