import { fail, ok } from "@/lib/api";
import { chiaveDedup, normalizzaEmail, nuovoTokenOspite } from "@/lib/anagrafica";
import { requireCliente } from "@/lib/clienti";
import { prisma } from "@/lib/db";
import { bloccaRisorse, validaBarcaNoleggio, verificaDisponibilita } from "@/lib/disponibilita";
import { FILTRO_CATALOGO } from "@/lib/marketplace";
import { escapeHtml, richiestaRicevutaBody, sendMail } from "@/lib/mailer";
import { getSession } from "@/lib/session";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";
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
  privacy: z.literal(true),
  azienda: z.string().max(200).optional(),
  istante: z.number().int().optional(),
  turnstileToken: z.string().max(4000).optional(),
});

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

  const s = await getSession();
  const clienteAccountId = s?.role === "cliente" ? s.sub : null;

  const email = normalizzaEmail(p.data.email);
  const dedupKey = chiaveDedup(p.data.telefono);
  // Token monouso per il recupero dall'area personale, solo se c'è un'email a cui inviarlo.
  const ospite = email ? nuovoTokenOspite() : null;

  // Il controllo di disponibilità e la creazione stanno nella stessa transazione,
  // con il lock per barca: una richiesta non scavalca una prenotazione in corso.
  const risultato = await prisma.$transaction(async (tx) => {
    await bloccaRisorse(tx, { boatIds: [boat.id] });

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
        clienteToken: ospite?.token ?? null,
        clienteTokenExpires: ospite?.scadenza ?? null,
      },
      select: { id: true },
    });
    return { booking, err: null, token: ospite?.token ?? null };
  });

  if (risultato.err) return fail(risultato.err, 409);

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

  return ok({ ricevuto: true, id: risultato.booking!.id }, 201);
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
