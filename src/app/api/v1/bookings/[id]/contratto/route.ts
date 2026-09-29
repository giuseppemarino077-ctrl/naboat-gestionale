import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";
import { randomUUID } from "crypto";

// Genera (o restituisce) il link del contratto da far firmare al cliente.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await ctx.params;

  const booking = await prisma.booking.findFirst({
    where: { id, tenantId: t.tenantId },
    select: { id: true, contrattoToken: true, contrattoFirmatoAt: true, stato: true },
  });
  if (!booking) return fail("Prenotazione non trovata", 404);
  if (booking.stato === "cancellata") return fail("Prenotazione annullata: nessun nuovo contratto", 422);
  if (booking.contrattoFirmatoAt) return fail("Contratto già firmato dal cliente", 422);

  const token = booking.contrattoToken ?? randomUUID().replace(/-/g, "");
  if (!booking.contrattoToken) {
    await prisma.booking.update({ where: { id: booking.id }, data: { contrattoToken: token } });
  }

  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  return ok({ url: `${base}/contratto/${token}`, token });
}
