import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { z } from "zod";

// Invito monouso del collaboratore: sceglie la password, conferma l'email e azzera il token.
export async function POST(req: Request) {
  const p = z.object({
    token: z.string().min(20).max(200),
    password: z.string().min(10).max(128),
  }).safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Password non valida: minimo 10 caratteri", 422);

  const u = await prisma.user.findFirst({ where: { verifyToken: p.data.token } });
  if (!u) return fail("Invito non valido o già usato", 404);
  if (u.passwordHash) return fail("Invito già utilizzato", 409);
  if (u.verifyExpires && u.verifyExpires < new Date()) return fail("Invito scaduto, chiedine uno nuovo", 422);

  await prisma.user.update({
    where: { id: u.id },
    data: {
      passwordHash: await hashPassword(p.data.password),
      emailVerified: true,
      verifyToken: null,
      verifyExpires: null,
    },
  });
  return ok({ ok: true });
}
