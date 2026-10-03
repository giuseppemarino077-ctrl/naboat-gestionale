import { fail, ok } from "@/lib/api";
import { registraAzione } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { CODICI_ESPERIENZA } from "@/lib/esperienze";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Esperienze dell'azienda: attivazione (flag) sul catalogo condiviso e
// allocazione alle singole barche. L'allocazione vive su Boat.esperienze, che è
// la stessa fonte usata dal filtro del marketplace.
async function stato(tenantId: string) {
  const [tenant, barche] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { esperienzeAttive: true, esperienzePersonalizzate: true } }),
    prisma.boat.findMany({
      where: { tenantId, uso: "noleggio", archiviato: false },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, esperienze: true, esperienzePersonalizzate: true },
    }),
  ]);
  return {
    attive: tenant?.esperienzeAttive ?? [],
    personalizzate: tenant?.esperienzePersonalizzate ?? [],
    barche,
  };
}

export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  return ok(await stato(t.tenantId));
}

const Schema = z.object({
  attive: z.array(z.string().max(40)).max(40),
  personalizzate: z.array(z.string().max(80)).max(20),
  allocazioni: z
    .array(
      z.object({
        boatId: z.string().uuid(),
        esperienze: z.array(z.string().max(40)).max(40),
        personalizzate: z.array(z.string().max(80)).max(20),
      })
    )
    .max(500)
    .default([]),
});

// Salvataggio completo: attivazione + allocazione per tutte le barche inviate.
// Le voci non attive vengono rimosse anche dalle barche (stato coerente).
export async function PUT(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati esperienze non validi", 422);

  const attive = Array.from(new Set(p.data.attive));
  if (attive.some((c) => !CODICI_ESPERIENZA.has(c))) return fail("Esperienza non valida", 422);
  const personalizzate = Array.from(new Set(p.data.personalizzate.map((s) => s.trim()).filter(Boolean)));
  const setAttive = new Set(attive);
  const setCustom = new Set(personalizzate);

  const barche = await prisma.boat.findMany({ where: { tenantId: t.tenantId, uso: "noleggio" }, select: { id: true } });
  const idValidi = new Set(barche.map((b) => b.id));
  if (p.data.allocazioni.some((a) => !idValidi.has(a.boatId))) return fail("Barca non valida per questa azienda", 422);

  const perBarca = new Map(p.data.allocazioni.map((a) => [a.boatId, a]));

  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: t.tenantId },
      data: { esperienzeAttive: attive, esperienzePersonalizzate: personalizzate },
    });
    // Ogni barca del noleggio riceve lo stato inviato, ripulito dalle voci non attive.
    for (const b of barche) {
      const a = perBarca.get(b.id);
      const esp = Array.from(new Set((a?.esperienze ?? []).filter((c) => setAttive.has(c))));
      const cus = Array.from(new Set((a?.personalizzate ?? []).map((s) => s.trim()).filter((s) => setCustom.has(s))));
      await tx.boat.update({ where: { id: b.id }, data: { esperienze: esp, esperienzePersonalizzate: cus } });
    }
  });

  await registraAzione({
    tenantId: t.tenantId,
    actorId: t.userId,
    azione: "esperienze.aggiornate",
    entita: "Tenant",
    entitaId: t.tenantId,
    nota: `${attive.length} attive · ${personalizzate.length} personalizzate`,
  });

  return ok(await stato(t.tenantId));
}
