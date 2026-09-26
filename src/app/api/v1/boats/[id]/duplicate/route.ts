import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";

// Duplicazione barca (RFQ: flotta e risorse)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const src = await prisma.boat.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!src) return fail("Barca non trovata", 404);
  const copy = await prisma.boat.create({
    data: {
      tenantId: t.tenantId,
      nome: `${src.nome} (copia)`,
      tipo: src.tipo,
      capienza: src.capienza,
      potenzaCv: src.potenzaCv,
      patenteRichiesta: src.patenteRichiesta,
      stato: "non_disponibile",
      fotoCopertina: null,
      fotoGallery: [],
    },
  });
  return ok(copy, 201);
}
