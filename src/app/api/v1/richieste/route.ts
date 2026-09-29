import { fail, ok } from "@/lib/api";
import { chiaveDedup, normalizzaEmail, nuovoTokenOspite } from "@/lib/anagrafica";
import { requireCliente } from "@/lib/clienti";
import { prisma } from "@/lib/db";
import { bloccaRisorse, validaBarcaNoleggio, verificaDisponibilita } from "@/lib/disponibilita";
import { FILTRO_CATALOGO, preventivoNoleggio } from "@/lib/marketplace";
import { escapeHtml, richiestaRicevutaBody, sendMail } from "@/lib/mailer";
import { getSession } from "@/lib/session";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";
import type { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { z } from "zod";

// Richiesta di prenotazione dal sito pubblico. Non è una conferma automatica:
// nasce come prenotazione "da_confermare" che il noleggiatore accetta o rifiuta.
const Schema = z.object({
  boatId: z.string().uuid(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  passeggeri: z.number().int().min(1).max(60),
  clienteNome: z.string().trim().min(2).max(120),
  telefono: z.string().trim().regex(/^[+0-9][0-9\s().\/-]{5,29}$/, "Telefono non valido"),
  email: z.string().trim().email().max(160).optional(),
  destinazione: z.string().trim().max(120).optional(),
  note: z.string().trim().max(1000).optional(),
  // Extra scelti dal cliente: vengono congelati nella richiesta e limitati a quantitaMax.
  extras: z.array(z.object({ extraId: z.string().uuid(), quantita: z.number().int().min(1).max(1000) })).max(20).optional(),
  privacy: z.literal(true),
  azienda: z.string().max(200).optional(),
  istante: z.number().int().optional(),
  turnstileToken: z.string().max(4000).optional(),
  // Ripetizione dello stesso invio (doppio clic, retry di rete): stessa chiave e
  // stessi dati -> si restituisce la richiesta già creata, senza duplicarla.
  idempotencyKey: z.string().max(80).optional(),
});

// Impronta dell'intento. Esclude i campi variabili del tentativo (istante, token
// anti-bot, campo esca): la stessa richiesta deve dare la stessa impronta.
function improntaRichiesta(v: z.infer<typeof Schema>): string {
  const canonico = {
    boatId: v.boatId,
    startAt: v.startAt,
    endAt: v.endAt,
    passeggeri: v.passeggeri,
    clienteNome: v.clienteNome,
    telefono: v.telefono,
    email: v.email ?? null,
    destinazione: v.destinazione ?? null,
    note: v.note ?? null,
    extras: [...(v.extras ?? [])].map((e) => `${e.extraId}:${e.quantita}`).sort(),
  };
  return createHash("sha256").update(JSON.stringify(canonico)).digest("hex");
}

// Forma pubblica del preventivo congelato (usata sia alla creazione sia al replay).
function preventivoPubblico(p: {
  stato: string;
  motivo: string | null;
  tipo: string;
  stagione: string;
  prezzoNoleggioCent: number | null;
  extraTotaleCent: number;
  commissioniCent: number;
  totaleClienteCent: number | null;
}) {
  return {
    stato: p.stato,
    motivo: p.motivo,
    tipo: p.tipo,
    stagione: p.stagione,
    prezzoNoleggioCent: p.prezzoNoleggioCent,
    extraTotaleCent: p.extraTotaleCent,
    commissioniCent: p.commissioniCent,
    totaleClienteCent: p.totaleClienteCent,
  };
}

// Link monouso per collegare una richiesta ospite all'area personale.
function collegamentoBody(link: string, azienda: string, barca: string, quando: string) {
  const url = escapeHtml(link);
  return {
    subject: `Collega la tua richiesta a NaBoat — ${barca}`,
    text: [
      `Ciao,`,
      "",
      `abbiamo ricevuto la tua richiesta di prenotazione per ${barca} (${azienda}).`,
      `Quando: ${quando}`,
      "",
      `Se hai già un account NaBoat, apri questo link per collegare la richiesta alla tua area personale (valido 7 giorni, una sola volta):`,
      link,
      "",
      "Se non riconosci questa richiesta, ignora il messaggio.",
    ].join("\n"),
    html: `<p>Ciao,</p><p>abbiamo ricevuto la tua richiesta di prenotazione per <b>${escapeHtml(barca)}</b> (${escapeHtml(azienda)}).</p>
<p>Quando: <b>${escapeHtml(quando)}</b></p>
<p>Apri questo link per collegare la richiesta alla tua <b>area personale</b> (valido 7 giorni, una sola volta):</p>
<p><a href="${url}">${url}</a></p>
<p style="color:#888;font-size:12px">Se non riconosci questa richiesta, ignora il messaggio.</p>`,
  };
}

async function inviaCollegamento(token: string, email: string, azienda: string, barca: string, quando: string, base: string) {
  const link = `${base}/area?collega=${encodeURIComponent(token)}`;
  const corpo = collegamentoBody(link, azienda, barca, quando);
  await sendMail(email, corpo.subject, corpo.text, corpo.html);
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dati non validi", 422);
  if ((p.data.azienda ?? "").trim() !== "") return ok({ ricevuto: true });
  if (p.data.istante && Date.now() - p.data.istante < 2000) return fail("Compila il modulo con calma e riprova", 422);
  if (!(await verifyTurnstile(p.data.turnstileToken, ip))) return fail("Verifica anti-bot non superata", 403);
  if (!(await rateLimit(`rl:richieste:ip:${ip}`, 8, 3600)).ok) return fail("Hai già inviato diverse richieste: riprova più tardi", 429);

  const start = new Date(p.data.startAt);
  const end = new Date(p.data.endAt);
  if (!(start < end)) return fail("Orari incoherenti", 422);

  // M05: limiti delle richieste dal sito. Durata e anticipo sono configurabili da
  // NaBoat; un piccolo margine assorbe la latenza senza ammettere date passate.
  const cfg = await prisma.platformSettings
    .findUnique({
      where: { id: "singleton" },
      select: { opzioneScadenzaOre: true, richiestaMaxDurataGiorni: true, richiestaMaxAnticipoGiorni: true },
    })
    .catch(() => null);
  const opzioneOre = Math.max(1, cfg?.opzioneScadenzaOre ?? 48);
  const maxDurataGiorni = cfg?.richiestaMaxDurataGiorni ?? 30;
  const maxAnticipoGiorni = cfg?.richiestaMaxAnticipoGiorni ?? 730;
  const msGiorno = 86400000;
  const adesso = Date.now();
  if (start.getTime() < adesso - 5 * 60000) return fail("La data di partenza è nel passato", 422);
  if (end.getTime() - start.getTime() > maxDurataGiorni * msGiorno) {
    return fail(`La richiesta supera la durata massima di ${maxDurataGiorni} giorni`, 422);
  }
  if (start.getTime() - adesso > maxAnticipoGiorni * msGiorno) {
    return fail(`Si può richiedere una data al massimo con ${maxAnticipoGiorni} giorni di anticipo`, 422);
  }
  const opzioneScadenzaAt = new Date(adesso + opzioneOre * 3600000);

  // M01: stessa regola unica del catalogo. Se il marketplace è spento, la barca è
  // bloccata da NaBoat o mancano foto/prezzo, non si accettano nuove richieste.
  const boat = await prisma.boat.findFirst({
    where: { id: p.data.boatId, ...FILTRO_CATALOGO },
    include: { tenant: { select: { id: true, nome: true } } },
  });
  if (!boat) return fail("Barca non disponibile", 404);
  // Stesse regole dello stato finale: barca a noleggio (già in query), non in
  // manutenzione, capienza rispettata.
  const errBarca = validaBarcaNoleggio(boat, p.data.passeggeri);
  if (errBarca) return fail(errBarca.startsWith("Capienza") ? `Capienza massima ${boat.capienza} persone` : "Barca non disponibile", 422);

  // Idempotenza: un retry con la stessa chiave non crea un doppione. La chiave non
  // vale per un'altra azienda; con dati diversi si risponde 409.
  const impronta = p.data.idempotencyKey ? improntaRichiesta(p.data) : null;
  if (p.data.idempotencyKey) {
    const dup = await prisma.booking.findUnique({ where: { idempotencyKey: p.data.idempotencyKey } });
    if (dup) {
      if (dup.tenantId !== boat.tenantId) return fail("Chiave idempotenza già usata", 409);
      if (dup.idempotencyHash && dup.idempotencyHash !== impronta) return fail("Chiave idempotenza già usata con dati diversi", 409);
      const snap = dup.preventivoSnapshot as unknown as Parameters<typeof preventivoPubblico>[0] | null;
      return ok({ ricevuto: true, id: dup.id, riutilizzato: true, preventivo: snap ? preventivoPubblico(snap) : undefined });
    }
  }

  // M03 — snapshot dell'offerta congelato alla richiesta. Il prezzo può essere
  // determinato oppure no: in entrambi i casi resta una richiesta "da_confermare",
  // mai un acquisto concluso. Una variazione di listino non riscrive questa offerta.
  const preventivo = await preventivoNoleggio({
    tenantId: boat.tenantId,
    boatId: boat.id,
    startAt: start,
    endAt: end,
    passeggeri: p.data.passeggeri,
    extraRichiesti: p.data.extras ?? [],
    origineCanale: "naboat",
  });
  const idAmmessi = new Set(preventivo.extraDisponibili.map((e) => e.id));
  if ((p.data.extras ?? []).some((e) => !idAmmessi.has(e.extraId))) {
    return fail("Uno degli extra scelti non è disponibile per questa barca", 422);
  }
  const prezzoNoleggioCent = preventivo.prezzoNoleggioCent;

  const s = await getSession();
  const clienteAccountId = s?.role === "cliente" ? s.sub : null;

  const email = normalizzaEmail(p.data.email);
  const dedupKey = chiaveDedup(p.data.telefono);
  // Token monouso per il recupero dall'area personale, solo se c'è un'email a cui inviarlo.
  const ospite = email ? nuovoTokenOspite() : null;

  // Il controllo di disponibilità e la creazione stanno nella stessa transazione,
  // con il lock per barca: una richiesta non scavalca una prenotazione in corso.
  const risultato = await prisma.$transaction(async (tx) => {
    await bloccaRisorse(tx, { boatIds: [boat.id], chiaviExtra: p.data.idempotencyKey ? [`idem:${p.data.idempotencyKey}`] : [] });

    // Ricontrollo dentro il lock: due retry arrivati insieme non duplicano.
    if (p.data.idempotencyKey) {
      const dup = await tx.booking.findUnique({ where: { idempotencyKey: p.data.idempotencyKey } });
      if (dup) {
        if (dup.tenantId !== boat.tenantId) return { err: "Chiave idempotenza già usata", token: null, booking: null };
        if (dup.idempotencyHash && dup.idempotencyHash !== impronta) return { err: "Chiave idempotenza già usata con dati diversi", token: null, booking: null };
        return { booking: { id: dup.id }, err: null, token: null, duplicato: true, snapshot: dup.preventivoSnapshot as unknown as Parameters<typeof preventivoPubblico>[0] | null };
      }
    }

    const disp = await verificaDisponibilita(tx, { tenantId: boat.tenantId, boatId: boat.id, startAt: start, endAt: end });
    if (!disp.ok) return { err: "La barca non è disponibile in quelle date", token: null, booking: null };

    // La richiesta pubblica NON crea né sovrascrive l'anagrafica: si limita a
    // collegare un Customer già esistente con lo stesso telefono. Il contatto
    // della singola richiesta resta sui campi della prenotazione.
    const customer = await tx.customer.findUnique({
      where: { tenantId_dedupKey: { tenantId: boat.tenantId, dedupKey } },
      select: { id: true },
    });

    const booking = await tx.booking.create({
      data: {
        tenantId: boat.tenantId,
        boatId: boat.id,
        customerId: customer?.id ?? null,
        clienteAccountId,
        startAt: start,
        endAt: end,
        passeggeri: p.data.passeggeri,
        clienteNome: p.data.clienteNome,
        telefono: p.data.telefono,
        email,
        destinazione: p.data.destinazione ?? null,
        note: p.data.note ?? null,
        stato: "da_confermare",
        origineCanale: "naboat",
        // M05: la richiesta tiene la barca solo fino a questa ora; poi la libera il
        // rilascio automatico (o, se il job è in ritardo, già la disponibilità).
        opzioneScadenzaAt,
        idempotencyKey: p.data.idempotencyKey ?? null,
        idempotencyHash: impronta,
        ...(prezzoNoleggioCent != null && prezzoNoleggioCent > 0 ? { prezzoCent: prezzoNoleggioCent } : {}),
        prezzoDaDefinire: preventivo.stato === "da_definire",
        preventivoSnapshot: preventivo as unknown as Prisma.InputJsonValue,
        extras: preventivo.extra.length
          ? { create: preventivo.extra.map((e) => ({ extraId: e.id, quantita: e.quantita })) }
          : undefined,
        clienteToken: ospite?.token ?? null,
        clienteTokenExpires: ospite?.scadenza ?? null,
      },
      select: { id: true },
    });
    return { booking, err: null, token: ospite?.token ?? null };
  });

  if (risultato.err) return fail(risultato.err, 409);
  // Retry idempotente: nessun nuovo effetto (niente email doppie), si restituisce
  // la richiesta già salvata con la sua offerta congelata.
  if ("duplicato" in risultato && risultato.duplicato) {
    return ok({
      ricevuto: true,
      id: risultato.booking!.id,
      riutilizzato: true,
      preventivo: risultato.snapshot ? preventivoPubblico(risultato.snapshot) : undefined,
    });
  }

  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const quando = start.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" });

  // Avvisa il noleggiatore via email (senza SMTP il messaggio resta nel log).
  try {
    const owner = await prisma.user.findFirst({ where: { tenantId: boat.tenantId, role: "owner" }, select: { email: true } });
    if (owner?.email) {
      const corpo = richiestaRicevutaBody({
        azienda: boat.tenant.nome,
        barca: boat.nome,
        cliente: p.data.clienteNome,
        telefono: p.data.telefono,
        quando,
        passeggeri: p.data.passeggeri,
        note: p.data.note ?? null,
      });
      await sendMail(owner.email, corpo.subject, corpo.text, corpo.html);
    }
  } catch { /* l'email non deve bloccare la richiesta */ }

  // Al richiedente ospite: link monouso per ritrovare la richiesta nell'area.
  if (email && risultato.token) {
    try {
      await inviaCollegamento(risultato.token, email, boat.tenant.nome, boat.nome, quando, base);
    } catch { /* l'email non deve bloccare la richiesta */ }
  }

  return ok(
    {
      ricevuto: true,
      id: risultato.booking!.id,
      // Offerta congelata: il form la mostra come tale (prezzo determinato o da definire).
      preventivo: {
        stato: preventivo.stato,
        motivo: preventivo.motivo,
        tipo: preventivo.tipo,
        stagione: preventivo.stagione,
        prezzoNoleggioCent,
        extraTotaleCent: preventivo.extraTotaleCent,
        commissioniCent: preventivo.commissioniCent,
        totaleClienteCent: preventivo.totaleClienteCent,
      },
    },
    201
  );
}

// Collegamento di una richiesta ospite all'area personale (link monouso),
// oppure nuovo invio del link. Richiede la sessione cliente completa: non si
// collegano mai prenotazioni di altri.
const CollegaSchema = z.discriminatedUnion("azione", [
  z.object({ azione: z.literal("collega"), token: z.string().min(20).max(200) }),
  z.object({ azione: z.literal("rinvia") }),
]);

export async function PUT(req: Request) {
  const g = await requireCliente();
  if ("error" in g) return g.error;
  const p = CollegaSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Richiesta non valida", 422);
  const emailAccount = normalizzaEmail(g.account.email);

  if (p.data.azione === "rinvia") {
    if (!emailAccount) return fail("Sul tuo account non c'è un'email", 422);
    if (!(await rateLimit(`rl:richieste:rinvia:${g.account.id}`, 3, 3600)).ok) return fail("Troppi invii: riprova più tardi", 429);
    const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
    const prenotazioni = await prisma.booking.findMany({
      where: { email: emailAccount, clienteAccountId: null, stato: "da_confermare" },
      include: { boat: { select: { nome: true } }, tenant: { select: { nome: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    let inviate = 0;
    for (const b of prenotazioni) {
      let token = b.clienteToken;
      if (!token || (b.clienteTokenExpires && b.clienteTokenExpires < new Date())) {
        const nuovo = nuovoTokenOspite();
        token = nuovo.token;
        await prisma.booking.update({ where: { id: b.id }, data: { clienteToken: token, clienteTokenExpires: nuovo.scadenza, clienteTokenUsatoAt: null } });
      }
      const quando = b.startAt.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" });
      await inviaCollegamento(token, emailAccount, b.tenant.nome, b.boat.nome, quando, base);
      inviate++;
    }
    return ok({ inviate });
  }

  const b = await prisma.booking.findUnique({ where: { clienteToken: p.data.token } });
  if (!b) return fail("Link non valido o già usato", 404);
  if (b.clienteTokenExpires && b.clienteTokenExpires < new Date()) return fail("Link scaduto: richiedine un altro dall'area personale", 422);
  // L'email del link e quella dell'account devono coincidere: il token da solo
  // non basta a collegare la richiesta di un'altra persona.
  if (!b.email || normalizzaEmail(b.email) !== emailAccount) return fail("Questo link è stato inviato a un altro indirizzo email", 403);
  await prisma.booking.update({
    where: { id: b.id },
    data: { clienteAccountId: g.account.id, clienteTokenUsatoAt: new Date(), clienteToken: null, clienteTokenExpires: null },
  });
  return ok({ collegata: true, bookingId: b.id });
}
