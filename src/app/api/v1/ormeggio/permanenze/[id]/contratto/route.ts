import { randomBytes } from "crypto";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireImportiOrmeggio } from "@/lib/ormeggio";
import { improntaContratto, snapshotOrmeggio } from "@/lib/contratti";

// Genera il contratto di ormeggio/rimessaggio con una versione congelata
// (testoSnapshot + impronta). Una modifica della permanenza non riscrive la
// versione acquisita: si crea una nuova revisione solo se non è ancora firmata.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireImportiOrmeggio(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const perm = await prisma.permanenza.findFirst({
    where: { id, tenantId: t.tenantId },
    include: {
      boat: { include: { proprietario: true } },
      posto: { include: { area: true } },
      attivita: true,
      contratto: true,
      tenant: { select: { nome: true, logoUrl: true, telefonoContatto: true, indirizzoPartenza: true } },
    },
  });
  if (!perm) return fail("Permanenza non trovata", 404);
  if (!perm.boat?.proprietario) return fail("Serve il proprietario della barca per generare il contratto", 422);
  if (!perm.finePrevistaAt) return fail("Per il contratto a termine servono le date: indica la fine prevista", 422);
  if (!perm.corrispettivoCent) return fail("Indica il corrispettivo concordato nella scheda", 422);

  const snapshot = snapshotOrmeggio({
    azienda: {
      nome: perm.tenant.nome,
      logo: perm.tenant.logoUrl,
      telefono: perm.tenant.telefonoContatto,
      indirizzo: perm.tenant.indirizzoPartenza,
    },
    tipo: perm.tipo,
    proprietario: {
      nome: perm.boat.proprietario.nome,
      telefono: perm.boat.proprietario.telefono,
      email: perm.boat.proprietario.email,
    },
    barca: { nome: perm.boat.nome, tipo: perm.boat.tipo },
    posto: perm.posto.codice,
    area: perm.posto.area.nome,
    inizioAt: perm.inizioAt,
    finePrevistaAt: perm.finePrevistaAt,
    corrispettivoCent: perm.corrispettivoCent,
    servizi: perm.attivita
      .filter((a) => !a.incluso)
      .map((a) => ({ tipo: a.tipo, quantita: a.quantita, unita: a.unita, prezzoCent: a.prezzoCent })),
  });
  const hash = improntaContratto(snapshot);

  let contratto = perm.contratto;
  if (!contratto) {
    const token = randomBytes(24).toString("hex");
    contratto = await prisma.contrattoOrmeggio.create({
      data: { tenantId: t.tenantId, permanenzaId: perm.id, tipo: perm.tipo, token, testoSnapshot: snapshot, versione: 1, hash },
    });
    await prisma.auditLog.create({
      data: { tenantId: t.tenantId, actorId: t.userId, azione: "ormeggio.contratto.create", entita: "Permanenza", entitaId: perm.id },
    });
  } else if (!contratto.firmatoAt) {
    if (contratto.hash == null) {
      // Versione storica non firmata (senza impronta): si congela adesso il
      // contenuto mostrato. Nessuna impronta retroattiva: vale solo da qui in poi.
      const scritto = await prisma.contrattoOrmeggio.updateMany({
        where: { id: contratto.id, hash: null, firmatoAt: null },
        data: { testoSnapshot: snapshot, hash, versione: contratto.versione ?? 1 },
      });
      if (scritto.count === 1) contratto = { ...contratto, testoSnapshot: snapshot, hash };
    } else if (contratto.hash !== hash) {
      const versione = (contratto.versione ?? 1) + 1;
      const scritto = await prisma.contrattoOrmeggio.updateMany({
        where: { id: contratto.id, firmatoAt: null, hash: contratto.hash },
        data: { testoSnapshot: snapshot, hash, versione },
      });
      if (scritto.count === 1) {
        contratto = { ...contratto, testoSnapshot: snapshot, hash, versione };
        await prisma.auditLog.create({
          data: {
            tenantId: t.tenantId,
            actorId: t.userId,
            azione: "ormeggio.contratto.revisione",
            entita: "Permanenza",
            entitaId: perm.id,
            dettagli: JSON.stringify({ versione }),
          },
        });
      }
    }
  }

  return ok({
    token: contratto.token,
    link: `/contratto-ormeggio/${contratto.token}`,
    firmatoAt: contratto.firmatoAt,
    versione: contratto.versione,
    hash: contratto.hash,
  });
}
