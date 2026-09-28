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
  return ok({
    user: {
      id: user.id,
      email: user.email,
      nome: user.nome,
      role: user.role,
      tenantId: user.tenantId,
      tenantNome: user.tenant?.nome ?? null,
      tenantLogo: user.tenant?.logoUrl ?? null,
      tenantStatus: user.tenant?.status ?? null,
      tenantModulo: user.tenant?.tipoModulo ?? null,
      tenantOrmeggio: user.tenant?.moduloOrmeggio ?? false,
      vedeImporti: user.vedeImporti,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.totpEnabled,
      twoFactorRequired: process.env.REQUIRE_2FA === "true" && (user.role === "owner" || user.role === "superadmin"),
    },
  });
}
