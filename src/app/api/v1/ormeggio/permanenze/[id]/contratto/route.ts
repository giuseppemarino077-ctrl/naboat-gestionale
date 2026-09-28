import { randomBytes } from "crypto";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireImportiOrmeggio } from "@/lib/ormeggio";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireImportiOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const perm = await prisma.permanenza.findFirst({
    where: { id, tenantId: t.tenantId },
    include: { boat: { include: { proprietario: true } }, posto: true, attivita: true, contratto: true },
  });
  if (!perm) return fail("Permanenza non trovata", 404);
  if (!perm.boat?.proprietario) return fail("Serve il proprietario della barca per generare il contratto", 422);
  if (!perm.finePrevistaAt) return fail("Per il contratto a termine servono le date: indica la fine prevista", 422);
  if (!perm.corrispettivoCent) return fail("Indica il corrispettivo concordato nella scheda", 422);

  let contratto = perm.contratto;
  if (!contratto) {
    const token = randomBytes(24).toString("hex");
    contratto = await prisma.contrattoOrmeggio.create({
      data: {
        tenantId: t.tenantId,
        permanenzaId: perm.id,
        tipo: perm.tipo,
        token,
        testoSnapshot: {
          proprietario: { nome: perm.boat.proprietario.nome, telefono: perm.boat.proprietario.telefono, email: perm.boat.proprietario.email },
          barca: { nome: perm.boat.nome, tipo: perm.boat.tipo },
          posto: perm.posto.codice,
          inizioAt: perm.inizioAt,
          finePrevistaAt: perm.finePrevistaAt,
          corrispettivoCent: perm.corrispettivoCent,
          servizi: perm.attivita.filter((a) => !a.incluso).map((a) => ({ tipo: a.tipo, quantita: a.quantita, unita: a.unita, prezzoCent: a.prezzoCent })),
        },
      },
    });
    await prisma.auditLog.create({
      data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.contratto.create", entita: "Permanenza", entitaId: perm.id },
    });
  }
  return ok({ token: contratto.token, link: `/contratto-ormeggio/${contratto.token}`, firmatoAt: contratto.firmatoAt });
}
