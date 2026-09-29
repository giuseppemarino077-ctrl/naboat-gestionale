import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";
import { z } from "zod";

// Elenco barche a livello di piattaforma, con possibilità di nascondere una barca non conforme.
export async function GET(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const q = new URL(req.url).searchParams;
  const stato = q.get("stato");
  const cerca = (q.get("q") ?? "").trim().toLowerCase();
  const boats = await prisma.boat.findMany({
    where: {
      uso: "noleggio",
      ...(stato === "pubblicate" ? { pubblicata: true, inPausa: false, bloccataAdmin: false } : {}),
      ...(stato === "nascoste" ? { OR: [{ pubblicata: false }, { inPausa: true }, { bloccataAdmin: true }] } : {}),
      ...(cerca ? { nome: { contains: cerca, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { tenant: { select: { id: true, nome: true, status: true } } },
  });
  return ok(boats);
}

// `motivo` è obbligatorio per nascondere; l'autore è il superadmin che agisce.
const Schema = z.object({
  boatId: z.string().uuid(),
  azione: z.enum(["nascondi", "mostra"]),
  motivo: z.string().trim().min(3).max(300).optional(),
});

export async function PATCH(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const b = await prisma.boat.findUnique({ where: { id: p.data.boatId }, select: { id: true, tenantId: true } });
  if (!b) return fail("Barca non trovata", 404);
  if (p.data.azione === "nascondi" && !p.data.motivo) return fail("Indicare il motivo del blocco", 422);

  // Il blocco admin è un campo dedicato: non tocchiamo la scelta editoriale del
  // noleggiatore (pubblicata/inPausa), così non può sbloccarsi da sé.
  await prisma.boat.update({
    where: { id: b.id },
    data:
      p.data.azione === "nascondi"
        ? { bloccataAdmin: true, motivoBlocco: p.data.motivo, bloccataAt: new Date(), bloccataDa: g.session.sub }
        : { bloccataAdmin: false, motivoBlocco: null, bloccataAt: null, bloccataDa: null },
  });
  await prisma.auditLog.create({
    data: {
      tenantId: b.tenantId,
      actorId: g.session.sub,
      azione: `barca.${p.data.azione}`,
      entita: "Boat",
      entitaId: b.id,
      dettagli: p.data.motivo ? JSON.stringify({ motivo: p.data.motivo }).slice(0, 20000) : null,
    },
  });
  return ok({ ok: true });
}
