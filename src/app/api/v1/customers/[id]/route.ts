import { fail, ok } from "@/lib/api";
import { registraAzione } from "@/lib/audit";
import { normalizzaEmail } from "@/lib/anagrafica";
import { prisma } from "@/lib/db";
import { normalizzaTelefono } from "@/lib/telefono";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

// Modifica dell'anagrafica reale (CRM). Le note cliente sono distinte dalle note
// prenotazione. Un cliente senza contatti resta consultabile; questa modifica
// richiede però almeno un recapito, come l'editor del riferimento.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = z.object({
    nome: z.string().min(2).max(160).optional(),
    telefono: z.string().max(40).optional().nullable(),
    email: z.string().email().max(320).optional().nullable(),
    note: z.string().max(5000).optional().nullable(),
  }).safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);

  const cur = await prisma.customer.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!cur) return fail("Cliente non trovato", 404);

  const dati: Record<string, unknown> = {};
  if (p.data.nome !== undefined) dati.nome = p.data.nome;
  if (p.data.note !== undefined) dati.note = p.data.note;
  if (p.data.email !== undefined) dati.email = normalizzaEmail(p.data.email);

  const telefonoPresente = p.data.telefono !== undefined;
  const emailPresente = p.data.email !== undefined;
  const telFinale = telefonoPresente ? p.data.telefono : cur.telefono;
  const emailFinale = emailPresente ? normalizzaEmail(p.data.email) : cur.email;
  if ((telefonoPresente || emailPresente) && !telFinale && !emailFinale) {
    return fail("Serve almeno un contatto (email o telefono) per salvare i recapiti", 422);
  }

  if (telefonoPresente) {
    if (p.data.telefono) {
      const tel = normalizzaTelefono(p.data.telefono);
      if (!tel.ok) return fail(tel.motivo, 422);
      const conflitto = await prisma.customer.findFirst({
        where: { tenantId: t.tenantId, telefono: tel.canonico, NOT: { id } },
        select: { nome: true },
      });
      if (conflitto) return fail(`Esiste già un cliente con questo telefono (${conflitto.nome})`, 409);
      dati.telefono = tel.canonico;
      dati.dedupKey = tel.canonico;
    } else {
      // Si può togliere il telefono solo se resta un'email e la chiave non collide.
      const base = emailFinale ? `e:${emailFinale}` : `n:${cur.nome.toLowerCase()}`;
      const conflitto = await prisma.customer.findFirst({ where: { tenantId: t.tenantId, dedupKey: base, NOT: { id } }, select: { id: true } });
      dati.telefono = null;
      dati.dedupKey = conflitto ? `${base}:${cur.id.slice(0, 8)}` : base;
    }
  }

  if (Object.keys(dati).length === 0) return fail("Nessuna modifica richiesta", 422);

  try {
    const r = await prisma.customer.updateMany({ where: { id, tenantId: t.tenantId }, data: dati });
    if (!r.count) return fail("Cliente non trovato", 404);
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") return fail("Esiste già un cliente con questo contatto", 409);
    throw e;
  }
  return ok({ ok: true });
}

// Eliminazione dall'anagrafica. Le prenotazioni restano nello storico: il
// collegamento viene azzerato (il contatto della singola prenotazione è già
// conservato sulla prenotazione stessa). Nessun dato di altre aziende.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;

  const cur = await prisma.customer.findFirst({
    where: { id, tenantId: t.tenantId },
    select: { id: true, nome: true, _count: { select: { bookings: true } } },
  });
  if (!cur) return fail("Cliente non trovato", 404);

  const scollegate = await prisma.$transaction(async (tx) => {
    const r = await tx.booking.updateMany({ where: { customerId: cur.id, tenantId: t.tenantId }, data: { customerId: null } });
    await tx.customer.delete({ where: { id: cur.id } });
    return r.count;
  });

  await registraAzione({
    tenantId: t.tenantId,
    actorId: t.userId,
    azione: "customer.delete",
    entita: "Customer",
    entitaId: cur.id,
    nota: `${cur.nome} · ${scollegate} prenotazioni scollegate`,
  });
  return ok({ eliminato: true, prenotazioniScollegate: scollegate });
}
