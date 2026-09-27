import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { escapeHtml, sendMail, subjectSicuro } from "@/lib/mailer";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { z } from "zod";

// Form «Contatti» del sito pubblico. Protezioni sovrapposte:
// 1) campo esca nascosto: i robot lo riempiono, le persone no;
// 2) tempo minimo di compilazione: un invio nello stesso istante di apertura è un robot;
// 3) Turnstile di Cloudflare (attivo quando le chiavi sono configurate);
// 4) limite di invii per IP e per email.
const Schema = z
  .object({
    nome: z.string().trim().min(2, "Scrivi il nome").max(80, "Nome troppo lungo"),
    cognome: z.string().trim().min(2, "Scrivi il cognome").max(80, "Cognome troppo lungo"),
    telefono: z.string().trim().regex(/^[+0-9][0-9\s().\/-]{5,29}$/, "Numero di telefono non valido"),
    email: z.string().trim().email("Email non valida").max(160, "Email troppo lunga"),
    messaggio: z.string().trim().max(1000, "Messaggio troppo lungo").optional(),
    privacy: z.literal(true, { errorMap: () => ({ message: "Serve il consenso al trattamento dei dati" }) }),
    azienda: z.string().max(200).optional(), // campo esca: deve restare vuoto
    istante: z.number().int().optional(), // quando è stato aperto il modulo
    turnstileToken: z.string().max(4000).optional(),
  })
  .strict();

const DESTINATARIO = process.env.CONTATTI_EMAIL || "info@naboat.it";

// Il testo libero è la porta dei messaggi pubblicitari: si tolgono gli indirizzi web
// e si tiene il resto (così una richiesta vera non va persa).
function senzaLink(testo: string): string {
  return testo
    .replace(/https?:\/\/\S+|www\.\S+/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Dati non validi", 422);

  // Campo esca pieno: è un robot. Si risponde «ricevuto» senza salvare,
  // così il robot non capisce di essere stato scoperto.
  if ((p.data.azienda ?? "").trim() !== "") return ok({ ricevuto: true });

  // Invio troppo rapido: le persone non compilano quattro campi in due secondi.
  if (p.data.istante && Date.now() - p.data.istante < 2000) return fail("Compila il modulo con calma e riprova", 422);

  const grezzo = (p.data.messaggio ?? "").trim();
  const messaggio = grezzo ? senzaLink(grezzo) : "";
  // Testo fatto solo di link: è spam. Risposta finta, niente salvataggio.
  if (grezzo && !messaggio) return ok({ ricevuto: true });

  if (!(await verifyTurnstile(p.data.turnstileToken, ip))) return fail("Verifica anti-bot non superata", 403);
  if (!(await rateLimit(`rl:contatti:ip:${ip}`, 10, 3600)).ok) return fail("Hai già inviato diverse richieste: riprova più tardi", 429);
  if (!(await rateLimit(`rl:contatti:email:${p.data.email.toLowerCase()}`, 3, 3600)).ok) return fail("Hai già inviato diverse richieste: riprova più tardi", 429);

  const richiesta = await prisma.richiestaContatto.create({
    data: {
      nome: p.data.nome,
      cognome: p.data.cognome,
      telefono: p.data.telefono,
      email: p.data.email,
      messaggio: messaggio || null,
      privacyAt: new Date(),
      ip,
      userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
  });

  const quando = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" });
  // Tutti i valori inseriti dall'utente vengono neutralizzati nell'HTML per evitare
  // che il messaggio di notifica possa contenere markup.
  const hNome = escapeHtml(`${p.data.nome} ${p.data.cognome}`);
  const hTelefono = escapeHtml(p.data.telefono);
  const hEmail = escapeHtml(p.data.email);
  const hMessaggio = escapeHtml(messaggio).replace(/\n/g, "<br>");
  await sendMail(
    DESTINATARIO,
    subjectSicuro(`Contatto dal sito: ${p.data.nome} ${p.data.cognome}`),
    [
      "Nuova richiesta dal form dei contatti del sito.",
      "",
      `Nome: ${p.data.nome} ${p.data.cognome}`,
      `Telefono: ${p.data.telefono}`,
      `Email: ${p.data.email}`,
      ...(messaggio ? ["", "Messaggio:", messaggio] : []),
      "",
      `Ricevuta: ${quando}`,
      "La trovi anche nel pannello NaBoat, sezione Messaggi dal sito.",
    ].join("\n"),
    `<p>Nuova richiesta dal form dei contatti del sito.</p>
<ul>
  <li><b>Nome:</b> ${hNome}</li>
  <li><b>Telefono:</b> ${hTelefono}</li>
  <li><b>Email:</b> ${hEmail}</li>
  <li><b>Ricevuta:</b> ${quando}</li>
</ul>
${hMessaggio ? `<p><b>Messaggio:</b><br>${hMessaggio}</p>` : ""}
<p>La trovi anche nel pannello NaBoat, sezione <b>Messaggi dal sito</b>.</p>`,
  );

  return ok({ ricevuto: true, id: richiesta.id }, 201);
}
