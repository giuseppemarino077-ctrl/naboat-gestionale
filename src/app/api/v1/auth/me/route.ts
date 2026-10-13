import { ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { identitaCorrente } from "@/lib/identita";

export async function GET() {
  const id = await identitaCorrente();
  if (!id.ok) return ok({ user: null });
  const user = await prisma.user.findUnique({
    where: { id: id.user.id },
    include: { tenant: true },
  });
  if (!user) return ok({ user: null });
  const m = id.user.tenantId ? await prisma.appartenenza.findUnique({ where: { tenantId_userId: { tenantId: id.user.tenantId, userId: user.id } }, include: { tenant: true } }) : null;
  const tenant = m?.tenant ?? user.tenant;

  return ok({
    user: {
      id: user.id,
      email: user.email,
      nome: user.nome,
      role: id.user.role,
      tenantId: id.user.tenantId,
      tenantNome: tenant?.nome ?? null,
      tenantLogo: tenant?.logoUrl ?? null,
      tenantStatus: tenant?.status ?? null,
      tenantModulo: m && m.role !== "owner" && !m.accessoNoleggio && m.accessoOrmeggio ? "ormeggio" : tenant?.tipoModulo ?? null,
      tenantOrmeggio: !!tenant?.moduloOrmeggio && (m?.role === "owner" || (m?.accessoOrmeggio ?? true)),
      vedeImporti: id.user.role === "owner" || id.user.vedeImporti,
      ruoloOrmeggio: m?.ruoloOrmeggio,
      accessoNoleggio: m?.role === "owner" ? !tenant?.moduloOrmeggio || tenant?.tipoModulo === "entrambi" : m?.accessoNoleggio,
      accessoOrmeggio: m?.role === "owner" ? !!tenant?.moduloOrmeggio : m?.accessoOrmeggio,
      appartenenzaRevisione: m?.revisione,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.totpEnabled,
      twoFactorRequired: process.env.REQUIRE_2FA === "true" && (id.user.role === "owner" || id.user.role === "superadmin"),
    },
  });
}
