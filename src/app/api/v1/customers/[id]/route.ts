import { fail, ok } from "@/lib/api";
import { chiaveDedup, normalizzaEmail } from "@/lib/anagrafica";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = z.object({
    nome: z.string().min(2).max(120).optional(),
    telefono: z.string().min(4).max(40).optional(),
    email: z.string().email().max(160).optional().nullable(),
    note: z.string().max(2000).optional().nullable(),
  }).safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);

  const dati: Record<string, unknown> = {};
  if (p.data.nome !== undefined) dati.nome = p.data.nome;
  if (p.data.note !== undefined) dati.note = p.data.note;
  if (p.data.email !== undefined) dati.email = normalizzaEmail(p.data.email);

  if (p.data.telefono !== undefined) {
    const dedupKey = chiaveDedup(p.data.telefono);
    if (dedupKey.length < 4) return fail("Telefono non valido", 422);
    // Cambiare numero è un'operazione esplicita: se il numero è già di un altro
    // cliente non si fonde nulla in automatico, si segnala il conflitto.
    const conflitto = await prisma.customer.findFirst({
      where: { tenantId: t.tenantId, dedupKey, NOT: { id } },
      select: { nome: true },
    });
    if (conflitto) return fail(`Esiste già un cliente con questo telefono (${conflitto.nome})`, 409);
    dati.telefono = p.data.telefono;
    dati.dedupKey = dedupKey;
  }

  if (Object.keys(dati).length === 0) return fail("Nessuna modifica richiesta", 422);

  try {
    const r = await prisma.customer.updateMany({ where: { id, tenantId: t.tenantId }, data: dati });
    if (!r.count) return fail("Cliente non trovato", 404);
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") return fail("Esiste già un cliente con questo telefono", 409);
    throw e;
  }
  return ok({ ok: true });
}
