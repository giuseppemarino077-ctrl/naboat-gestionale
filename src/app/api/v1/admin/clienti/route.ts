import { ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";

// Elenco clienti finali e clienti registrati dalle aziende, a livello di piattaforma.
export async function GET(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const q = new URL(req.url).searchParams;
  const cerca = (q.get("q") ?? "").trim();
  const [accounts, clienti] = await Promise.all([
    prisma.clienteAccount.findMany({
      where: cerca ? { OR: [{ nome: { contains: cerca, mode: "insensitive" } }, { email: { contains: cerca, mode: "insensitive" } }] } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, nome: true, email: true, telefono: true, emailVerified: true, createdAt: true, _count: { select: { bookings: true } }, patente: { select: { stato: true } } },
    }),
    prisma.customer.findMany({
      where: cerca ? { OR: [{ nome: { contains: cerca, mode: "insensitive" } }, { telefono: { contains: cerca } }] } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { tenant: { select: { nome: true } }, _count: { select: { bookings: true } } },
    }),
  ]);
  return ok({ accounts, clienti });
}
