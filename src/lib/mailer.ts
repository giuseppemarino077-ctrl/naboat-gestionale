// Invio email transazionali via SMTP (casella Aruba del dominio).
// Senza SMTP_HOST/SMTP_USER/SMTP_PASS configurati, i messaggi vengono solo loggati (dev).
import nodemailer, { type Transporter } from "nodemailer";

const APP_URL = process.env.APP_URL || "http://localhost:3000";

let transporter: Transporter | null = null;

function smtpHost() {
  return process.env.SMTP_HOST;
}

function smtpUser() {
  return process.env.SMTP_USER;
}

function smtpConfigured() {
  return Boolean(smtpHost() && smtpUser() && process.env.SMTP_PASS);
}

function smtpPort() {
  return Number(process.env.SMTP_PORT ?? 465);
}

function mailer() {
  if (!transporter) {
    const port = smtpPort();
    const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
    transporter = nodemailer.createTransport({
      host: smtpHost(),
      port,
      secure,
      auth: { user: smtpUser()!, pass: process.env.SMTP_PASS! },
      requireTLS: !secure,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transporter;
}

export async function sendMail(to: string, subject: string, textBody: string, htmlBody?: string) {
  if (!smtpConfigured()) {
    console.log(`[mailer:dev] a=${to} oggetto="${subject}"\n${textBody}`);
    return { sent: false };
  }
  const from = process.env.MAIL_FROM || smtpUser()!;
  try {
    await mailer().sendMail({ from, to, subject, text: textBody, html: htmlBody });
    return { sent: true };
  } catch (error) {
    console.error(`[mailer] invio a ${to} fallito:`, error instanceof Error ? error.message : error);
    return { sent: false };
  }
}

export function verifyEmailBody(token: string) {
  const url = `${APP_URL}/verifica-email?token=${encodeURIComponent(token)}`;
  return {
    subject: "Conferma il tuo indirizzo email NaBoat",
    text: `Benvenuto in NaBoat.\n\nConferma la tua email aprendo questo link (valido 48 ore):\n${url}\n\nSe non hai richiesto tu la registrazione, ignora questo messaggio.`,
    html: `<p>Benvenuto in NaBoat.</p><p>Conferma la tua email aprendo questo link (valido 48 ore):</p><p><a href="${url}">${url}</a></p><p>Se non hai richiesto tu la registrazione, ignora questo messaggio.</p>`,
  };
}

export type DatiPromemoria = {
  azienda: string;
  cliente: string;
  barca: string;
  quando: string;
  passeggeri: number;
  destinazione?: string | null;
  puntoPartenza?: string | null;
  telefono?: string | null;
  contrattoUrl?: string | null;
};

// Promemoria al cliente il giorno prima dell'uscita.
export function promemoriaBody(d: DatiPromemoria) {
  const righe = [
    `Ciao ${d.cliente},`,
    "",
    `ti ricordiamo la tua uscita in mare di domani:`,
    `  • Imbarcazione: ${d.barca}`,
    `  • Quando: ${d.quando}`,
    `  • Passeggeri: ${d.passeggeri}`,
  ];
  if (d.destinazione) righe.push(`  • Destinazione: ${d.destinazione}`);
  if (d.puntoPartenza) righe.push(`  • Punto di partenza: ${d.puntoPartenza}`);
  righe.push("");
  righe.push("Cosa portare: documento d'identità, patente nautica se richiesta, crema solare e acqua.");
  righe.push("Ti consigliamo di arrivare 15 minuti prima della partenza.");
  if (d.contrattoUrl) righe.push("", `Contratto da firmare online: ${d.contrattoUrl}`);
  if (d.telefono) righe.push("", `Per qualsiasi necessità: ${d.telefono}`);
  righe.push("", `A domani!`, d.azienda);

  return {
    subject: `Promemoria: la tua uscita di domani con ${d.azienda}`,
    text: righe.join("\n"),
    html: `<p>Ciao ${d.cliente},</p><p>ti ricordiamo la tua uscita in mare di <b>domani</b>:</p>
<ul>
  <li>Imbarcazione: <b>${d.barca}</b></li>
  <li>Quando: <b>${d.quando}</b></li>
  <li>Passeggeri: <b>${d.passeggeri}</b></li>${d.destinazione ? `\n  <li>Destinazione: <b>${d.destinazione}</b></li>` : ""}${d.puntoPartenza ? `\n  <li>Punto di partenza: <b>${d.puntoPartenza}</b></li>` : ""}
</ul>
<p><b>Cosa portare:</b> documento d'identità, patente nautica se richiesta, crema solare e acqua.<br>
Ti consigliamo di arrivare <b>15 minuti prima</b> della partenza.</p>
${d.contrattoUrl ? `<p>Contratto da firmare online: <a href="${d.contrattoUrl}">${d.contrattoUrl}</a></p>` : ""}
${d.telefono ? `<p>Per qualsiasi necessità: <b>${d.telefono}</b></p>` : ""}
<p>A domani!<br><b>${d.azienda}</b></p>`,
  };
}
