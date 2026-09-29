import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { bloccaRisorse, validaBarcaNoleggio, validaPatente, verificaDisponibilita } from "@/lib/disponibilita";
import { parseImportoEuro } from "@/lib/payments";
import { extrasDelTenant } from "@/lib/riferimenti";
import { requireAzienda } from "@/lib/tenant";
import { createHash } from "crypto";
import { z } from "zod";

const normTel = (s: string) => s.replace(/\D/g, "").slice(-15);

// Chi non ha il permesso importi riceve la prenotazione senza cifre economiche
// (né sul noleggio né sugli extra), mantenendo la stessa forma dei campi.
function prenotazioneSenzaImporti(b: any) {
  return {
    ...b,
    prezzoCent: null,
    cauzioneCent: null,
    cauzioneIntentId: null,
    danniCent: null,
    extras: Array.isArray(b.extras)
      ? b.extras.map((e: any) => ({ ...e, extra: e.extra ? { ...e.extra, prezzo: null } : e.extra }))
      : b.extras,
  };
}

export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams;
  const where: any = { tenantId: t.tenantId };
  if (q.get("from")) where.startAt = { ...(where.startAt ?? {}), gte: new Date(q.get("from")!) };
  if (q.get("to")) where.endAt = { ...(where.endAt ?? {}), lte: new Date(q.get("to")!) };
  if (q.get("boatId")) where.boatId = q.get("boatId");
  if (q.get("stato")) where.stato = q.get("stato");
  const list = await prisma.booking.findMany({
    where,
    orderBy: { startAt: "asc" },
    take: 200,
    include: { boat: { select: { nome: true } }, skipper: { select: { nome: true } }, extras: { include: { extra: true } } },
  });
  if (t.vedeImporti === false) return ok(list.map(prenotazioneSenzaImporti));
  return ok(list);
}

const Schema = z.object({
  boatId: z.string().min(1),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  passeggeri: z.number().int().min(1).max(60).default(2),
  clienteNome: z.string().min(1).max(120),
  telefono: z.string().min(4).max(40),
  email: z.string().email().max(160).optional(),
  destinazione: z.string().max(120).optional(),
  formula: z.string().max(120).optional(),
  note: z.string().max(2000).optional(),
  patenteOk: z.boolean().default(false),
  skipperId: z.string().optional(),
  extraIds: z.array(z.string()).max(20).default([]),
  extraQuantita: z.record(z.string(), z.number().int().min(1).max(1000)).optional(),
  idempotencyKey: z.string().max(80).optional(),
  stato: z.enum(["da_confermare", "prenotata"]).default("prenotata"),
  prezzoEuro: z.string().max(20).optional().nullable(),
  pagato: z.boolean().optional(),
});

// Impronta dell'intento (payload normalizzato): alla stessa chiave di idempotenza
// deve corrispondere la stessa richiesta, altrimenti si risponde 409.
function improntaPayload(v: z.infer<typeof Schema>): string {
  const canonico = {
    boatId: v.boatId,
    startAt: v.startAt,
    endAt: v.endAt,
    passeggeri: v.passeggeri,
    clienteNome: v.clienteNome,
    telefono: v.telefono,
    email: v.email ?? null,
    destinazione: v.destinazione ?? null,
    formula: v.formula ?? null,
    note: v.note ?? null,
    patenteOk: v.patenteOk,
    skipperId: v.skipperId ?? null,
    extraIds: [...v.extraIds].sort(),
    extraQuantita: Object.fromEntries(Object.entries(v.extraQuantita ?? {}).sort(([a], [b]) => a.localeCompare(b))),
    stato: v.stato,
    prezzoEuro: v.prezzoEuro ?? null,
    pagato: v.pagato ?? false,
  };
  return createHash("sha256").update(JSON.stringify(canonico)).digest("hex");
}

export async function POST(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati prenotazione non validi", 422);
  const v = p.data;
  // Prezzo o incasso indicati da chi non ha il permesso importi: rifiutati.
  if (t.vedeImporti === false && (v.prezzoEuro || v.pagato)) return fail("Permesso negato: non hai l'accesso agli importi", 403);
  const start = new Date(v.startAt);
  const end = new Date(v.endAt);
  if (start >= end) return fail("Orari incoherenti", 422);

  const impronta = v.idempotencyKey ? improntaPayload(v) : null;

  // Retry immediato della stessa richiesta: si restituisce l'esito già salvato.
  if (v.idempotencyKey) {
    const dup = await prisma.booking.findUnique({ where: { idempotencyKey: v.idempotencyKey } });
    if (dup) {
      if (dup.tenantId !== t.tenantId) return fail("Chiave idempotenza già usata", 409);
      if (dup.idempotencyHash && dup.idempotencyHash !== impronta) return fail("Chiave idempotenza già usata con dati diversi", 409);
      return ok(dup);
    }
  }

  // Gli extra devono appartenere alla stessa azienda: il solo id non è garanzia.
  const extraCheck = await extrasDelTenant(t.tenantId, v.extraIds);
  if (!extraCheck.ok) return fail("Extra non validi per questa azienda", 422);

  const dedupKey = normTel(v.telefono);
  const prezzoCent = v.prezzoEuro ? parseImportoEuro(v.prezzoEuro) : null;
  if (v.prezzoEuro && prezzoCent === null) return fail("Prezzo non valido", 422);

  // Tutto in transazione, con i lock per barca (e skipper): due addetti che salvano nello
  // stesso istante non possono superare insieme il controllo (il trigger del database resta
  // il secondo livello). La stessa chiave di idempotenza serializza i retry.
  let risultato: { err?: string; status?: number; booking?: any; duplicato?: boolean };
  try {
    risultato = await prisma.$transaction(async (tx) => {
      await bloccaRisorse(tx, {
        boatIds: [v.boatId],
        skipperId: v.skipperId,
        chiaviExtra: v.idempotencyKey ? [`idem:${v.idempotencyKey}`] : [],
      });

      // Ricontrollo dentro il lock: due retry con la stessa chiave non duplicano.
      if (v.idempotencyKey) {
        const dup = await tx.booking.findUnique({ where: { idempotencyKey: v.idempotencyKey } });
        if (dup) {
          if (dup.tenantId !== t.tenantId) return { err: "Chiave idempotenza già usata", status: 409 };
          if (dup.idempotencyHash && dup.idempotencyHash !== impronta) return { err: "Chiave idempotenza già usata con dati diversi", status: 409 };
          return { booking: dup, duplicato: true };
        }
      }

      const boat = await tx.boat.findFirst({ where: { id: v.boatId, tenantId: t.tenantId } });
      if (!boat) return { err: "Barca non trovata", status: 404 };
      const errBarca = validaBarcaNoleggio(boat, v.passeggeri);
      if (errBarca) return { err: errBarca, status: 422 };
      const errPatente = validaPatente(boat, { patenteOk: v.patenteOk, skipperId: v.skipperId });
      if (errPatente) return { err: errPatente, status: 422 };

      if (v.skipperId) {
        const sk = await tx.skipper.findFirst({ where: { id: v.skipperId, tenantId: t.tenantId, attivo: true }, select: { id: true } });
        if (!sk) return { err: "Skipper non valido", status: 422 };
      }

      const disp = await verificaDisponibilita(tx, {
        tenantId: t.tenantId,
        boatId: v.boatId,
        startAt: start,
        endAt: end,
        skipperId: v.skipperId ?? null,
      });
      if (!disp.ok) return { err: disp.messaggio, status: 409 };

      const customer = await tx.customer.upsert({
        where: { tenantId_dedupKey: { tenantId: t.tenantId, dedupKey } },
        update: { nome: v.clienteNome, ...(v.email ? { email: v.email } : {}) },
        create: { tenantId: t.tenantId, nome: v.clienteNome, telefono: v.telefono, email: v.email, dedupKey },
      });

      const booking = await tx.booking.create({
        data: {
          tenantId: t.tenantId,
          boatId: v.boatId,
          customerId: customer.id,
          startAt: start,
          endAt: end,
          passeggeri: v.passeggeri,
          clienteNome: v.clienteNome,
          telefono: v.telefono,
          destinazione: v.destinazione,
          formula: v.formula,
          note: v.note,
          patenteOk: v.patenteOk,
          stato: v.stato,
          ...(prezzoCent !== null ? { prezzoCent } : {}),
          skipperId: v.skipperId || undefined,
          idempotencyKey: v.idempotencyKey,
          idempotencyHash: impronta,
          extras: { create: v.extraIds.map((id) => ({ extraId: id, quantita: v.extraQuantita?.[id] ?? 1 })) },
        },
        include: { boat: { select: { nome: true } }, skipper: { select: { nome: true } } },
      });

      // Prenotazione manuale già pagata: l'incasso entra nella stessa transazione,
      // così non restano effetti parziali se qualcosa fallisce.
      if (v.pagato && prezzoCent !== null) {
        await tx.payment.create({
          data: {
            tenantId: t.tenantId,
            bookingId: booking.id,
            provider: "manuale",
            tipo: "saldo",
            importoCent: prezzoCent,
            totaleCent: prezzoCent,
            stato: "pagato",
            metodo: "manuale",
            descrizione: "Incasso registrato a mano (prenotazione rapida)",
            paidAt: new Date(),
          },
        });
      }

      return { booking };
    });
  } catch (e) {
    // Due retry con la stessa chiave arrivati insieme: vince il primo, l'altro ne legge l'esito.
    // Ci si limita al vincolo sull'idempotenza: altri P2002 (es. cliente) non vanno mascherati.
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      const meta = (e as { meta?: { target?: unknown } }).meta;
      const target = Array.isArray(meta?.target) ? meta.target.join(",") : String(meta?.target ?? "");
      if (/idempotencykey/i.test(target)) {
        const dup = v.idempotencyKey ? await prisma.booking.findUnique({ where: { idempotencyKey: v.idempotencyKey } }) : null;
        if (dup && dup.tenantId === t.tenantId) {
          if (dup.idempotencyHash && dup.idempotencyHash !== impronta) return fail("Chiave idempotenza già usata con dati diversi", 409);
          return ok(dup);
        }
        return fail("Chiave idempotenza già usata", 409);
      }
      throw e;
    }
    if (/Sovrapposizione/i.test(e instanceof Error ? e.message : String(e))) return fail("Sovrapposizione con altra prenotazione", 409);
    throw e;
  }

  if (risultato.err) return fail(risultato.err, risultato.status ?? 422);
  if (risultato.duplicato) return ok(risultato.booking);
  return ok(risultato.booking, 201);
}
