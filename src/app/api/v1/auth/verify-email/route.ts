import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Conferma email del proprietario tramite token (valido 48h).
export async function POST(req: Request) {
  const p = z.object({ token: z.string().min(20).max(200) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Token non valido", 422);
  const u = await prisma.user.findFirst({ where: { verifyToken: p.data.token } });
  if (!u) return fail("Token non valido o già usato", 404);
  if (u.verifyExpires && u.verifyExpires < new Date()) return fail("Token scaduto, richiedine un altro", 422);
  await prisma.user.update({ where: { id: u.id }, data: { emailVerified: true, verifyToken: null, verifyExpires: null } });
  return ok({ emailVerified: true });
}
