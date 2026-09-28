import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";
import { z } from "zod";

// Moderazione recensioni riservata a NaBoat, con motivazione registrata.
export async function GET(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const stato = new URL(req.url).searchParams.get("stato");
  const recensioni = await prisma.recensione.findMany({
    where: stato ? { stato } : {},
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      tenant: { select: { id: true, nome: true } },
      booking: { select: { id: true, clienteNome: true, startAt: true } },
    },
  });
  return ok(recensioni);
}

const Schema = z.object({
  id: z.string().uuid(),
  azione: z.enum(["pubblica", "nascondi"]),
  motivo: z.string().trim().max(500).optional(),
});

export async function PATCH(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const r = await prisma.recensione.findUnique({ where: { id: p.data.id } });
  if (!r) return fail("Recensione non trovata", 404);
  if (p.data.azione === "nascondi" && !p.data.motivo?.trim()) return fail("Indica il motivo della moderazione", 422);
  const aggiornata = await prisma.recensione.update({
    where: { id: r.id },
    data: {
      stato: p.data.azione === "pubblica" ? "pubblicata" : "nascosta",
      moderazioneMotivo: p.data.azione === "nascondi" ? p.data.motivo!.trim() : null,
      moderataAt: new Date(),
    },
  });
  await prisma.auditLog.create({ data: { actorId: g.session.sub, azione: `recensione.${p.data.azione}`, entita: "Recensione", entitaId: r.id, ...(p.data.motivo ? { dettagli: JSON.stringify({ motivo: p.data.motivo }).slice(0, 20000) } : {}) } });
  return ok(aggiornata);
}
