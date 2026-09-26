import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { isOwnerOrSuperadmin, requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Dati dell'azienda mostrati nel portale (nome e logo).
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const tenant = await prisma.tenant.findUnique({
    where: { id: t.tenantId },
    select: { id: true, nome: true, logoUrl: true, indirizzoPartenza: true, telefonoContatto: true, status: true },
  });
  if (!tenant) return fail("Azienda non trovata", 404);
  return ok(tenant);
}

const Schema = z.object({
  nome: z.string().min(2).max(120).optional(),
  logoUrl: z.string().max(500).optional().nullable(),
  indirizzoPartenza: z.string().max(200).optional().nullable(),
  telefonoContatto: z.string().max(40).optional().nullable(),
});export async function PATCH(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  if (!isOwnerOrSuperadmin(t.role)) return fail("Riservato al proprietario", 403);
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  if (!p.data.nome && p.data.logoUrl === undefined && p.data.indirizzoPartenza === undefined && p.data.telefonoContatto === undefined) {
    return fail("Nessuna modifica richiesta", 422);
  }

  const tenant = await prisma.tenant.update({
    where: { id: t.tenantId },
    data: {
      ...(p.data.nome ? { nome: p.data.nome.trim() } : {}),
      ...(p.data.logoUrl !== undefined ? { logoUrl: p.data.logoUrl } : {}),
      ...(p.data.indirizzoPartenza !== undefined ? { indirizzoPartenza: p.data.indirizzoPartenza } : {}),
      ...(p.data.telefonoContatto !== undefined ? { telefonoContatto: p.data.telefonoContatto } : {}),
    },
    select: { id: true, nome: true, logoUrl: true, indirizzoPartenza: true, telefonoContatto: true },
  });
  await prisma.auditLog.create({
    data: { tenantId: t.tenantId, actorId: t.userId, azione: "azienda.modificata", entita: "Tenant", entitaId: t.tenantId },
  });
  return ok(tenant);
}
