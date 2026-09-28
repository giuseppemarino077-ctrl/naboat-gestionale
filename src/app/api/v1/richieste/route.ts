import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { richiestaRicevutaBody, sendMail } from "@/lib/mailer";
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

const normTel = (s: string) => s.replace(/\D/g, "").slice(-15);

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
  if (!(start < end)) return fail("Orari incoerenti", 422);

  const boat = await prisma.boat.findFirst({
    where: { id: p.data.boatId, uso: "noleggio", pubblicata: true, inPausa: false, tenant: { status: "active" } },
    include: { tenant: { select: { id: true, nome: true } } },
  });
  if (!boat) return fail("Barca non disponibile", 404);
  if (p.data.passeggeri > boat.capienza) return fail(`Capienza massima ${boat.capienza} persone`, 422);

  const s = await getSession();
  const clienteAccountId = s?.role === "cliente" ? s.sub : null;

  const impostazioni = await prisma.platformSettings.findUnique({ where: { id: "singleton" }, select: { tempoPreparazioneMin: true } }).catch(() => null);
  const prepMs = Math.max(0, impostazioni?.tempoPreparazioneMin ?? 0) * 60000;
  const startAllargato = new Date(start.getTime() - prepMs);
  const endAllargato = new Date(end.getTime() + prepMs);

  const dedupKey = normTel(p.data.telefono);

  const risultato = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${boat.id}))`;
    const overlap = await tx.booking.findFirst({
      where: { boatId: boat.id, tenantId: boat.tenantId, stato: { in: ["da_confermare", "prenotata", "in_mare"] }, startAt: { lt: endAllargato }, endAt: { gt: startAllargato } },
      select: { id: true },
    });
    if (overlap) return { err: "La barca non è disponibile in quelle date", booking: null };
    const block = await tx.block.findFirst({ where: { boatId: boat.id, tenantId: boat.tenantId, startAt: { lt: endAllargato }, endAt: { gt: startAllargato } }, select: { id: true } });
    if (block) return { err: "La barca non è disponibile in quelle date", booking: null };

    const customer = await tx.customer.upsert({
      where: { tenantId_dedupKey: { tenantId: boat.tenantId, dedupKey } },
      update: { nome: p.data.clienteNome, ...(p.data.email ? { email: p.data.email } : {}) },
      create: { tenantId: boat.tenantId, nome: p.data.clienteNome, telefono: p.data.telefono, email: p.data.email, dedupKey },
    });

    const booking = await tx.booking.create({
      data: {
        tenantId: boat.tenantId,
        boatId: boat.id,
        customerId: customer.id,
        clienteAccountId,
        startAt: start,
        endAt: end,
        passeggeri: p.data.passeggeri,
        clienteNome: p.data.clienteNome,
        telefono: p.data.telefono,
        destinazione: p.data.destinazione ?? null,
        note: p.data.note ?? null,
        stato: "da_confermare",
        origineCanale: "naboat",
      },
      select: { id: true },
    });
    return { booking, err: null };
  });

  if (risultato.err) return fail(risultato.err, 409);

  // Avvisa il noleggiatore via email (senza SMTP il messaggio resta nel log).
  try {
    const owner = await prisma.user.findFirst({ where: { tenantId: boat.tenantId, role: "owner" }, select: { email: true } });
    if (owner?.email) {
      const corpo = richiestaRicevutaBody({
        azienda: boat.tenant.nome,
        barca: boat.nome,
        cliente: p.data.clienteNome,
        telefono: p.data.telefono,
        quando: start.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" }),
        passeggeri: p.data.passeggeri,
        note: p.data.note ?? null,
      });
      await sendMail(owner.email, corpo.subject, corpo.text, corpo.html);
    }
  } catch { /* l'email non deve bloccare la richiesta */ }

  return ok({ ricevuto: true, id: risultato.booking!.id }, 201);
}
