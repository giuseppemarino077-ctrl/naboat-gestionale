import { ok } from "@/lib/api";
import { prisma } from "@/lib/db";

// Aspetto pubblico del portale: quello che serve alla pagina di accesso prima di entrare.
export async function GET() {
  const s = await prisma.platformSettings
    .findUnique({ where: { id: "singleton" }, select: { loginImmagine: true, loginSfocatura: true, loginMessaggio: true } })
    .catch(() => null);

  return ok({
    sfondo: s?.loginImmagine || "/img/sfondo-login.jpg",
    sfocatura: s?.loginSfocatura ?? 0,
    messaggio: s?.loginMessaggio ?? "",
  });
}
