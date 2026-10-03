import { fail, ok } from "@/lib/api";
import { generaLinkContratto } from "@/lib/contratto-link";
import { prisma } from "@/lib/db";
import { contrattoBody } from "@/lib/mailer";
import { accodaNotifica, consegnaNotifica } from "@/lib/notifiche";
import { requireAzienda } from "@/lib/tenant";

// Invio del contratto al cliente via email. WhatsApp resta lato client (link wa.me).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const canale = body?.canale ?? "email";
  if (canale !== "email") return fail("Canale non supportato dal server: usa WhatsApp dal browser", 422);

  const b = await prisma.booking.findFirst({
    where: { id, tenantId: t.tenantId },
    select: {
      email: true,
      clienteNome: true,
      customer: { select: { email: true } },
      tenant: { select: { nome: true } },
    },
  });
  if (!b) return fail("Prenotazione non trovata", 404);

  const email = b.email ?? b.customer?.email;
  if (!email) return fail("Manca l'email del cliente: aggiungila all'anagrafica prima di inviare", 422);

  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const link = await generaLinkContratto(t.tenantId, id, base);
  if (!link.ok) return fail(link.error, link.status);

  const corpo = contrattoBody({ azienda: b.tenant.nome, cliente: b.clienteNome ?? "cliente", url: link.url });
  const notifica = await accodaNotifica({
    tenantId: t.tenantId,
    evento: "contratto.invio",
    destinatario: email,
    oggetto: corpo.subject,
    testo: corpo.text,
    html: corpo.html,
  });
  if (!notifica) return fail("Indirizzo email non valido", 422);

  const esito = await consegnaNotifica(notifica.id);
  return ok({
    inviato: esito === "inviata",
    esito,
    email,
    url: link.url,
    messaggio: esito === "inviata" ? `Contratto inviato a ${email}.` : "Email in coda: verrà consegnata appena possibile (SMTP non configurato o temporaneamente non raggiungibile).",
  });
}
