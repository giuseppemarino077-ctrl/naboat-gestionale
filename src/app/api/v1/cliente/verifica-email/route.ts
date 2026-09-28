import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Conferma email dell'account cliente tramite token monouso (valido 48h).
export async function POST(req: Request) {
  const p = z.object({ token: z.string().min(20).max(200) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Token non valido", 422);
  const a = await prisma.clienteAccount.findFirst({ where: { verifyToken: p.data.token } });
  if (!a) return fail("Token non valido o già usato", 404);
  if (a.verifyExpires && a.verifyExpires < new Date()) return fail("Token scaduto, richiedine un altro", 422);
  await prisma.clienteAccount.update({
    where: { id: a.id },
    data: { emailVerified: true, verifyToken: null, verifyExpires: null },
  });
  return ok({ emailVerified: true });
}
