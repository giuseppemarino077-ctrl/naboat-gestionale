import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { traccia } from "@/lib/audit";
import { nomeTipo } from "@/modules/piattaforma/barche";
import { z } from "zod";

export const DatiBarcaCustodia = z.object({
  nome: z.string().trim().min(2).max(160).optional(),
  tipo: z.string().trim().max(40).nullable().optional(),
  tipoCodice: z.string().max(40).nullable().optional(),
  stato: z.enum(["disponibile", "non_disponibile", "manutenzione"]).optional(),
  lunghezzaM: z.number().min(0).max(200).nullable().optional(),
  codiceInterno: z.string().max(80).nullable().optional(),
}).strict();

const CAMPI_BARCA = {
  id: true, nome: true, tipo: true, tipoCodice: true, stato: true,
  uso: true, lunghezzaM: true, codiceInterno: true, proprietarioId: true, archiviato: true,
} satisfies Prisma.BoatSelect;

export function elencoBarcheCustodia(tenantId: string, archiviate = false) {
  return prisma.boat.findMany({
    where: { tenantId, uso: "custodia", archiviato: archiviate, ...(!archiviate ? { OR: [{ proprietarioId: null }, { proprietario: { archiviato: false } }] } : {}) },
    select: CAMPI_BARCA,
    orderBy: { nome: "asc" },
  });
}

export function barcaCustodia(tenantId: string, id: string) {
  return prisma.boat.findFirst({ where: { id, tenantId, uso: "custodia" }, select: CAMPI_BARCA });
}

export async function salvaBarcaCustodia(t: { tenantId: string; userId: string }, dati: z.infer<typeof DatiBarcaCustodia>, id?: string) {
  if (dati.tipoCodice && !nomeTipo(dati.tipoCodice)) return { error: "Tipo di barca non valido", status: 422 };
  const valori = { ...dati, ...(dati.tipoCodice ? { tipo: nomeTipo(dati.tipoCodice)! } : {}) };
  try {
    const esito = await prisma.$transaction(async (tx) => {
      if (!id) {
        if (!valori.nome) return { error: "Nome della barca obbligatorio", status: 422 };
        const barca = await tx.boat.create({ data: { ...valori, nome: valori.nome, tenantId: t.tenantId, uso: "custodia" }, select: CAMPI_BARCA });
        return { barca, prima: null };
      }
      const prima = await tx.boat.findFirst({ where: { id, tenantId: t.tenantId, uso: "custodia" }, select: CAMPI_BARCA });
      if (!prima) return { error: "Barca non trovata", status: 404 };
      if (prima.proprietarioId) await tx.$queryRaw`SELECT id FROM "Proprietario" WHERE id = ${prima.proprietarioId} AND "tenantId" = ${t.tenantId} FOR UPDATE`;
      const proprietario = prima.proprietarioId ? await tx.proprietario.findFirst({ where: { id: prima.proprietarioId, tenantId: t.tenantId }, select: { archiviato: true } }) : null;
      if (prima.archiviato || proprietario?.archiviato) return { error: "Barca rimossa: la scheda storica non è modificabile", status: 409 };
      const aggiornata = await tx.boat.updateMany({ where: { id, tenantId: t.tenantId, uso: "custodia", archiviato: false }, data: valori });
      if (!aggiornata.count) return { error: "Barca non più modificabile", status: 409 };
      const barca = await tx.boat.findFirstOrThrow({ where: { id, tenantId: t.tenantId, uso: "custodia" }, select: CAMPI_BARCA });
      return { barca, prima };
    });
    if (esito.barca) await traccia({ tenantId: t.tenantId, actorId: t.userId, azione: id ? "ormeggio.barca.modificata" : "ormeggio.barca.creata", entita: "Boat", entitaId: esito.barca.id, prima: esito.prima ?? {}, dopo: esito.barca });
    return esito;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "Codice interno già utilizzato", status: 409 };
    throw e;
  }
}
