import { fail } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

// Guardia per l'area del cliente finale: la sessione ha ruolo "cliente" e sub = id account.
export async function requireCliente() {
  const s = await getSession();
  if (!s || s.role !== "cliente") return { error: fail("Non autenticato", 401) as never };
  const account = await prisma.clienteAccount.findUnique({
    where: { id: s.sub },
    select: { id: true, email: true, nome: true, telefono: true, sessionVersion: true, emailVerified: true },
  });
  if (!account) return { error: fail("Sessione non più valida: accedi di nuovo", 401) as never };
  if ((s.ver ?? 0) !== account.sessionVersion) return { error: fail("Sessione scaduta: accedi di nuovo", 401) as never };
  return { account };
}
