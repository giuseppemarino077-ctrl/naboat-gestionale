import { fail, ok } from "@/lib/api";
import { saltHex } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { invitoBody, sendMail } from "@/lib/mailer";
import { hashPassword } from "@/lib/password";
import { ePro, pianoDelTenant } from "@/lib/piani";
import { isOwnerOrSuperadmin, requireTenant } from "@/lib/tenant";
import { z } from "zod";

// Operatori interni gestiti dal proprietario (RFQ: account e governance)
export async function GET(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  if (!isOwnerOrSuperadmin(t.role)) return fail("Riservato al proprietario", 403);
  const users = await prisma.user.findMany({
    where: { tenantId: t.tenantId },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, nome: true, role: true, vedeImporti: true, createdAt: true },
  });
  return ok(users);
}

export async function POST(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  if (!isOwnerOrSuperadmin(t.role)) return fail("Riservato al proprietario", 403);
  if (!ePro(await pianoDelTenant(t.tenantId))) return fail("I collaboratori sono disponibili con il piano Pro", 402);
  const p = z.object({
    email: z.string().email().max(160),
    // Se manca la password il collaboratore è invitato: la sceglie dal link email.
    password: z.string().min(10).max(128).optional(),
    nome: z.string().min(2).max(120),
    role: z.enum(["operatore", "skipper"]),
    vedeImporti: z.boolean().default(true),
  }).safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const email = p.data.email.toLowerCase().trim();
  if (await prisma.user.findUnique({ where: { email } })) return fail("Email già registrata", 409);

  // Senza password: invito monouso con scadenza, il collaboratore non ha ancora accesso.
  if (!p.data.password) {
    const verifyToken = saltHex(24);
    const user = await prisma.user.create({
      data: {
        tenantId: t.tenantId,
        email,
        passwordHash: null,
        nome: p.data.nome,
        role: p.data.role as any,
        vedeImporti: p.data.vedeImporti,
        verifyToken,
        verifyExpires: new Date(Date.now() + 72 * 60 * 60 * 1000),
      },
      select: { id: true, email: true, nome: true, role: true, vedeImporti: true, createdAt: true },
    });
    const base = process.env.APP_URL || new URL(req.url).origin;
    const link = `${base}/gestionale/invito?token=${encodeURIComponent(verifyToken)}`;
    const mail = invitoBody(link);
    await sendMail(email, mail.subject, mail.text, mail.html).catch(() => {});
    return ok(user, 201);
  }

  const user = await prisma.user.create({
    data: { tenantId: t.tenantId, email, passwordHash: await hashPassword(p.data.password), nome: p.data.nome, role: p.data.role as any, vedeImporti: p.data.vedeImporti },
    select: { id: true, email: true, nome: true, role: true, vedeImporti: true, createdAt: true },
  });
  return ok(user, 201);
}
