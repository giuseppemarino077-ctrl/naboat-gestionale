import { fail, ok } from "@/lib/api";
import { decifra } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";
import { z } from "zod";

// Verifica delle patenti riservata a NaBoat: qui il numero viene decifrato solo per lo staff.
export async function GET(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const stato = new URL(req.url).searchParams.get("stato");
  const patenti = await prisma.patenteNautica.findMany({
    where: stato ? { stato } : {},
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { account: { select: { id: true, nome: true, email: true, telefono: true } } },
  });
  return ok(patenti.map((p) => ({ ...p, numero: decifra(p.numeroCifrato), numeroCifrato: undefined })));
}

const Schema = z.object({
  accountId: z.string().uuid(),
  azione: z.enum(["approva", "rifiuta"]),
  motivo: z.string().trim().max(500).optional(),
  // Facoltativa: NaBoat può correggere la scadenza del documento durante la verifica.
  scadenza: z.string().trim().min(4).max(40).nullable().optional(),
});

export async function PATCH(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const pat = await prisma.patenteNautica.findUnique({ where: { accountId: p.data.accountId } });
  if (!pat) return fail("Patente non trovata", 404);
  if (p.data.azione === "rifiuta" && !p.data.motivo?.trim()) return fail("Indica il motivo del rifiuto", 422);

  // Scadenza: se indicata va aggiornata, altrimenti resta quella già nota.
  let scadenzaAt = pat.scadenzaAt;
  if (p.data.scadenza !== undefined) {
    if (p.data.scadenza === null || p.data.scadenza === "") scadenzaAt = null;
    else {
      const d = new Date(p.data.scadenza);
      if (Number.isNaN(d.getTime())) return fail("Data di scadenza non valida", 422);
      scadenzaAt = d;
    }
  }
  // Un documento scaduto non può essere approvato: la verifica non sarebbe valida.
  if (p.data.azione === "approva" && scadenzaAt && scadenzaAt < new Date()) {
    return fail("Documento scaduto: aggiorna la scadenza prima di approvare", 422);
  }

  const aggiornata = await prisma.patenteNautica.update({
    where: { accountId: pat.accountId },
    data: {
      scadenzaAt,
      stato: p.data.azione === "approva" ? "approvata" : "rifiutata",
      motivoRifiuto: p.data.azione === "rifiuta" ? p.data.motivo!.trim() : null,
      verificataAt: new Date(),
      verificatoDa: g.session.sub,
    },
  });
  await prisma.auditLog.create({ data: { actorId: g.session.sub, azione: `patente.${p.data.azione}`, entita: "PatenteNautica", entitaId: pat.id, ...(p.data.motivo ? { dettagli: JSON.stringify({ motivo: p.data.motivo }).slice(0, 20000) } : {}) } });
  return ok({ stato: aggiornata.stato, scadenzaAt: aggiornata.scadenzaAt });
}
