import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";
import { hashPassword } from "@/lib/password";
import { rigeneraAzienda } from "@/lib/seo";
import { z } from "zod";

export async function GET() {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { users: true, boats: true, bookings: true } } },
  });
  return ok(tenants);
}

const PatchSchema = z.object({
  id: z.string().uuid(),
  azione: z.enum(["approve", "suspend", "reactivate", "reject"]),
});

// Creazione manuale di un'azienda con il suo account titolare (per NaBoat).
const PostSchema = z.object({
  nome: z.string().trim().min(2).max(160),
  tipoModulo: z.enum(["noleggio", "ormeggio", "entrambi"]).default("noleggio"),
  ownerNome: z.string().trim().min(2).max(120),
  ownerEmail: z.string().trim().email().max(160),
  ownerPassword: z.string().min(10).max(128),
});

export async function POST(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const p = PostSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dati non validi", 422);
  const email = p.data.ownerEmail.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return fail("Email già registrata", 409);

  const tenant = await prisma.tenant.create({
    data: {
      nome: p.data.nome,
      status: "active",
      tipoModulo: p.data.tipoModulo as any,
      moduloOrmeggio: p.data.tipoModulo === "ormeggio" || p.data.tipoModulo === "entrambi",
    },
  });
  await prisma.user.create({
    data: { tenantId: tenant.id, email, passwordHash: await hashPassword(p.data.ownerPassword), nome: p.data.ownerNome, role: "owner", emailVerified: true },
  });
  await prisma.auditLog.create({ data: { tenantId: tenant.id, actorId: g.session.sub, azione: "tenant.creato.admin", entita: "Tenant", entitaId: tenant.id } });
  await rigeneraAzienda(tenant.id).catch(() => {});
  return ok({ id: tenant.id, status: tenant.status }, 201);
}

export async function PATCH(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => null);
  const p = PatchSchema.safeParse(body);
  if (!p.success) return fail("Richiesta non valida", 422);

  // Rifiuto: elimina tenant pending e tutto ciò che contiene (cascade)
  if (p.data.azione === "reject") {
    const cur = await prisma.tenant.findUnique({ where: { id: p.data.id } });
    if (!cur) return fail("Tenant non trovato", 404);
    if (cur.status !== "pending") return fail("Solo i pending si possono rifiutare (usa sospendi/elimina)", 422);
    await prisma.tenant.delete({ where: { id: cur.id } });
    return ok({ id: cur.id, status: "rejected" });
  }

  const status = p.data.azione === "approve" || p.data.azione === "reactivate" ? "active" : "suspended";
  const tenant = await prisma.tenant.update({ where: { id: p.data.id }, data: { status } }).catch(() => null);
  if (!tenant) return fail("Tenant non trovato", 404);
  // Sospensione: oltre al controllo per richiesta, si revocano le sessioni già aperte
  // di quell'azienda, così nessun gettone precedente resta utilizzabile.
  if (status === "suspended") {
    await prisma.user.updateMany({ where: { tenantId: tenant.id }, data: { sessionVersion: { increment: 1 } } });
  }
  await prisma.auditLog.create({
    data: { tenantId: tenant.id, actorId: g.session.sub, azione: `tenant.${p.data.azione}`, entita: "Tenant", entitaId: tenant.id },
  });
  // Approvando l'azienda si prepara anche la sua pagina pubblica (SEO) dai dati reali.
  if (status === "active") await rigeneraAzienda(tenant.id).catch(() => {});
  return ok({ id: tenant.id, status: tenant.status });
}

// Eliminazione tenant (con tutto il contenuto via cascade). Azione irreversibile.
export async function DELETE(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail("Parametro id obbligatorio", 422);
  const cur = await prisma.tenant.findUnique({ where: { id } });
  if (!cur) return fail("Tenant non trovato", 404);
  await prisma.tenant.delete({ where: { id } });
  return ok({ id, status: "deleted" });
}
