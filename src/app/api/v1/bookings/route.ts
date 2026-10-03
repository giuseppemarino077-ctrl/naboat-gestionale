import { fail, ok } from "@/lib/api";
import { normalizzaEmail } from "@/lib/anagrafica";
import { risolviCliente } from "@/lib/anagrafica-server";
import { chiaveTelefono, normalizzaTelefono } from "@/lib/telefono";
import { esitoPatente } from "@/lib/clienti";
import { prisma } from "@/lib/db";
import { bloccaRisorse, validaBarcaNoleggio, verificaDisponibilita } from "@/lib/disponibilita";
import { leggiPaginazione, rispostaPaginata } from "@/lib/paginazione";
import { parseImportoEuro } from "@/lib/payments";
import { extrasDelTenant } from "@/lib/riferimenti";
import { requireAzienda } from "@/lib/tenant";
import { createHash } from "crypto";
import { z } from "zod";

// Il link monouso di collegamento ospite non esce mai dalle liste.
function senzaLinkOspite<T extends Record<string, any>>(b: T): T {
  const c = { ...b };
  delete c.clienteToken;
  delete c.clienteTokenExpires;
  delete c.clienteTokenUsatoAt;
  return c;
}

// Chi non ha il permesso importi riceve la prenotazione senza cifre economiche
// (né sul noleggio né sugli extra), mantenendo la stessa forma dei campi.
function prenotazioneSenzaImporti(b: any) {
  return {
    ...b,
    prezzoCent: null,
    cauzioneCent: null,
    cauzioneIntentId: null,
    danniCent: null,
    // Lo snapshot contiene il prezzo dell'offerta: non deve uscire senza permesso.
    preventivoSnapshot: null,
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
  // Conteggio e finestra dal database: nessun filtro o taglio in memoria.
  const pag = leggiPaginazione(q, 200);
  const [totale, list] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.findMany({
      where,
      orderBy: { startAt: "asc" },
      skip: pag.salta,
      take: pag.dimensione,
      include: { boat: { select: { nome: true } }, skipper: { select: { nome: true } }, extras: { include: { extra: true } } },
    }),
  ]);
  let pulita = list.map(senzaLinkOspite);
  if (t.vedeImporti === false) pulita = pulita.map(prenotazioneSenzaImporti);
  return rispostaPaginata(pulita, totale, pag);
}

const NuovoSkipper = z.object({
  nome: z.string().min(2).max(160),
  telefono: z.string().max(40).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
});

const Schema = z.object({
  boatId: z.string().min(1),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  passeggeri: z.number().int().min(1).max(60).default(2),
  // Il form rapido impone 2–160 caratteri; l'API resta permissiva per i chiamanti
  // esistenti (import, test, prenotazioni manuali) e non rifiuta nomi brevi.
  clienteNome: z.string().min(1).max(160),
  // Telefono ed email facoltativi: il cliente può nascere con il solo nome.
  // Se fornito, il telefono è normalizzato a 8–15 cifre come nel riferimento.
  telefono: z.string().max(40).optional().nullable(),
  email: z.string().email().max(320).optional().nullable(),
  destinazione: z.string().max(120).optional(),
  formula: z.string().max(120).optional(),
  note: z.string().max(5000).optional(),
  // Dichiarazione patente del cliente: "YES" | "NO" | null (non raccolta).
  patenteRisposta: z.enum(["YES", "NO"]).nullable().optional(),
  patenteOk: z.boolean().optional(), // compatibilità: equivalente a patenteRisposta "YES"
  // Stato dell'assegnazione skipper: NONE | UNASSIGNED | ASSIGNED. Se manca, si deduce.
  skipperStato: z.enum(["NONE", "UNASSIGNED", "ASSIGNED"]).optional(),
  skipperId: z.string().uuid().optional().nullable(),
  nuovoSkipper: NuovoSkipper.optional().nullable(),
  // Modalità/sede operative della prenotazione (snapshot dei riferimenti).
  offertaId: z.string().uuid().optional().nullable(),
  portoId: z.string().uuid().optional().nullable(),
  // Collegamento esplicito a un cliente registrato: se presente, il requisito patente
  // si valuta sulla patente verificata dell'account (non sull'attestazione manuale).
  clienteAccountId: z.string().uuid().optional().nullable(),
  extraIds: z.array(z.string()).max(20).default([]),
  extraQuantita: z.record(z.string(), z.number().int().min(1).max(1000)).optional(),
  idempotencyKey: z.string().max(80).optional(),
  stato: z.enum(["da_confermare", "prenotata"]).default("prenotata"),
  prezzoEuro: z.string().max(20).optional().nullable(),
  prezzoDaDefinire: z.boolean().optional(),
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
    telefono: v.telefono ?? null,
    email: v.email ?? null,
    destinazione: v.destinazione ?? null,
    formula: v.formula ?? null,
    note: v.note ?? null,
    patenteRisposta: v.patenteRisposta ?? null,
    patenteOk: v.patenteOk ?? false,
    skipperStato: v.skipperStato ?? null,
    skipperId: v.skipperId ?? null,
    nuovoSkipper: v.nuovoSkipper ?? null,
    offertaId: v.offertaId ?? null,
    portoId: v.portoId ?? null,
    clienteAccountId: v.clienteAccountId ?? null,
    extraIds: [...v.extraIds].sort(),
    extraQuantita: Object.fromEntries(Object.entries(v.extraQuantita ?? {}).sort(([a], [b]) => a.localeCompare(b))),
    stato: v.stato,
    prezzoEuro: v.prezzoEuro ?? null,
    prezzoDaDefinire: v.prezzoDaDefinire ?? false,
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

  // Telefono normalizzato in un unico punto (region default IT): il valore canonico
  // E.164 è quello salvato; un numero non valido viene rifiutato.
  let telefonoNorm: string | null = null;
  if (v.telefono) {
    const tel = normalizzaTelefono(v.telefono);
    if (!tel.ok) return fail(tel.motivo, 422);
    telefonoNorm = tel.canonico;
  }
  const emailNorm = normalizzaEmail(v.email);

  // Deduplica: si riusa l'anagrafica riconosciuta da telefono o email. Se i due
  // contatti appartengono a due clienti diversi si risponde 409 (nessuna fusione).
  const [perTelefono, perEmail] = await Promise.all([
    telefonoNorm ? prisma.customer.findFirst({ where: { tenantId: t.tenantId, OR: [{ dedupKey: telefonoNorm }, { telefono: telefonoNorm }] }, select: { id: true, dedupKey: true } }) : null,
    emailNorm ? prisma.customer.findFirst({ where: { tenantId: t.tenantId, email: emailNorm }, select: { id: true, dedupKey: true } }) : null,
  ]);
  if (perTelefono && perEmail && perTelefono.id !== perEmail.id) {
    return fail("Telefono ed email appartengono a due clienti diversi: correggi uno dei contatti", 409);
  }

  const prezzoCent = v.prezzoEuro ? parseImportoEuro(v.prezzoEuro) : null;
  if (v.prezzoEuro && prezzoCent === null) return fail("Prezzo non valido", 422);
  const prezzoDaDefinire = v.prezzoDaDefinire === true && prezzoCent === null;
  if (v.prezzoEuro === "" ) return fail("Prezzo non valido", 422);
  // Un incasso manuale richiede un importo determinato: non si incassa "da definire".
  if (v.pagato && prezzoCent === null) return fail("Imposta il prezzo prima di registrare l'incasso", 422);

  // Un collegamento a un cliente registrato deve puntare a un account esistente.
  const clienteAccountId = v.clienteAccountId ?? null;
  if (clienteAccountId) {
    const account = await prisma.clienteAccount.findUnique({ where: { id: clienteAccountId }, select: { id: true } });
    if (!account) return fail("Cliente registrato non trovato", 422);
  }

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
      if (boat.eliminazioneRichiestaAt) return { err: "Barca in fase di rimozione: non accetta nuove assegnazioni", status: 409 };
      const errBarca = validaBarcaNoleggio(boat, v.passeggeri);
      if (errBarca) return { err: errBarca, status: 422 };

      // Modalità e sede operative: devono appartenere all'azienda; la modalità alla barca.
      if (v.offertaId) {
        const off = await tx.boatOfferta.findFirst({ where: { id: v.offertaId, tenantId: t.tenantId, boatId: v.boatId, attiva: true }, select: { id: true } });
        if (!off) return { err: "Modalità non valida per questa barca", status: 422 };
      }
      if (v.portoId) {
        const p = await tx.porto.findFirst({ where: { id: v.portoId, tenantId: t.tenantId }, select: { id: true } });
        if (!p) return { err: "Sede non valida per questa azienda", status: 422 };
      }

      // Skipper: esistente oppure creato inline nella stessa transazione (nessun orfano).
      let skipperId = v.skipperId ?? null;
      let skipperStato = v.skipperStato ?? (skipperId ? "ASSIGNED" : "NONE");
      if (v.nuovoSkipper) {
        const sk = await tx.skipper.create({
          data: {
            tenantId: t.tenantId,
            nome: v.nuovoSkipper.nome,
            telefono: chiaveTelefono(v.nuovoSkipper.telefono),
            note: v.nuovoSkipper.note ?? null,
          },
          select: { id: true },
        });
        skipperId = sk.id;
        skipperStato = "ASSIGNED";
      }
      if (skipperId) {
        const sk = await tx.skipper.findFirst({ where: { id: skipperId, tenantId: t.tenantId, attivo: true }, select: { id: true } });
        if (!sk) return { err: "Skipper non valido", status: 422 };
        skipperStato = "ASSIGNED";
      } else if (skipperStato !== "UNASSIGNED") {
        skipperStato = "NONE";
      }

      // Dichiarazione patente: "YES" | "NO" | null (non raccolta).
      const patenteRisposta = v.patenteRisposta ?? (v.patenteOk ? "YES" : null);
      const patenteOk = patenteRisposta === "YES";
      // Requisito patente: cliente registrato -> patente verificata; ospite -> dichiarazione.
      const patente = clienteAccountId
        ? await tx.patenteNautica.findUnique({ where: { accountId: clienteAccountId }, select: { stato: true, scadenzaAt: true } })
        : null;
      if (boat.patenteRichiesta && !clienteAccountId) {
        // Uno skipper già assegnato soddisfa il requisito anche se la dichiarazione
        // patente non è stata raccolta. Senza skipper la dichiarazione è obbligatoria.
        if (patenteRisposta == null && !skipperId) return { err: "Indica se il cliente ha la patente nautica richiesta per questa barca", status: 422 };
        if (patenteRisposta === "NO" && !skipperId) return { err: "Il cliente non ha la patente richiesta: assegna uno skipper prima di salvare", status: 422 };
      }
      const errPatente = esitoPatente(boat, { patenteOk, skipperId, clienteAccountId, patente });
      if (errPatente) return { err: errPatente, status: 422 };

      const disp = await verificaDisponibilita(tx, {
        tenantId: t.tenantId,
        boatId: v.boatId,
        startAt: start,
        endAt: end,
        skipperId,
      });
      if (!disp.ok) return { err: disp.messaggio, status: 409 };

      // L'anagrafica non si sovrascrive da una prenotazione: il cliente viene
      // riconosciuto per telefono, email o nome e i dati salvati allineano la
      // prenotazione (senza doppioni).
      const anag = await risolviCliente(tx, t.tenantId, { nome: v.clienteNome, telefono: telefonoNorm, email: emailNorm });

      const booking = await tx.booking.create({
        data: {
          tenantId: t.tenantId,
          boatId: v.boatId,
          customerId: anag.customerId,
          startAt: start,
          endAt: end,
          passeggeri: v.passeggeri,
          clienteNome: anag.nome,
          telefono: anag.telefono,
          email: anag.email,
          destinazione: v.destinazione,
          formula: v.formula,
          note: v.note,
          patenteRisposta: patenteRisposta ?? undefined,
          patenteOk,
          skipperStato,
          stato: v.stato,
          offertaId: v.offertaId ?? undefined,
          portoId: v.portoId ?? undefined,
          ...(prezzoCent !== null ? { prezzoCent } : {}),
          ...(prezzoDaDefinire ? { prezzoDaDefinire: true } : {}),
          skipperId: skipperId ?? undefined,
          clienteAccountId: clienteAccountId ?? undefined,
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
