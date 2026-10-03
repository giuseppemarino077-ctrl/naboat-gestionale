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

export function smtpConfigured() {
  return Boolean(smtpHost() && smtpUser() && process.env.SMTP_PASS);
}

export type StatoPosta = {
  smtp: boolean;
  appUrl: string | null;
  appUrlValido: boolean;
  abilitato: boolean;
  motivo: string | null;
};

// Stato leggibile della posta in uscita: serve al pannello per rendere chiaro
// se l'invio è disabilitato e perché. Non contiene segreti.
export function statoPosta(): StatoPosta {
  const appUrl = (process.env.APP_URL ?? "").trim() || null;
  let appUrlValido = false;
  if (appUrl) {
    try {
      const u = new URL(appUrl);
      appUrlValido = u.protocol === "http:" || u.protocol === "https:";
    } catch {
      appUrlValido = false;
    }
  }
  const smtp = smtpConfigured();
  const motivi: string[] = [];
  if (!smtp) motivi.push("SMTP non configurato");
  if (!appUrl) motivi.push("APP_URL non impostata");
  else if (!appUrlValido) motivi.push("APP_URL non valida");
  return {
    smtp,
    appUrl,
    appUrlValido,
    abilitato: smtp,
    motivo: motivi.length ? motivi.join("; ") : null,
  };
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

// I dati inseriti dagli utenti (nomi, battelli, destinazioni…) non devono poter
// iniettare HTML nelle email di notifica.
export function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Le intestazioni email non ammettono a capo: si neutralizzano per evitare header injection.
export function subjectSicuro(v: unknown): string {
  return String(v ?? "").replace(/[\r\n]+/g, " ").slice(0, 150);
}

export type EsitoMail = { sent: boolean; configurato: boolean; errore?: string };

export async function sendMail(to: string, subject: string, textBody: string, htmlBody?: string): Promise<EsitoMail> {
  if (!smtpConfigured()) {
    // Il fallback di log con il corpo completo resta solo in sviluppo (contiene
    // link riservati e token): in produzione si registra solo l'evento.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[mailer:dev] a=${to} oggetto="${subject}"\n${textBody}`);
    } else {
      console.warn(`[mailer] SMTP non configurato: email a ${to} non inviata (oggetto: "${subject}")`);
    }
    return { sent: false, configurato: false, errore: "SMTP non configurato" };
  }
  const from = process.env.MAIL_FROM || smtpUser()!;
  try {
    await mailer().sendMail({ from, to, subject, text: textBody, html: htmlBody });
    return { sent: true, configurato: true };
  } catch (error) {
    console.error(`[mailer] invio a ${to} fallito:`, error instanceof Error ? error.message : error);
    return { sent: false, configurato: true, errore: error instanceof Error ? error.message : "Invio non riuscito" };
  }
}

export function verifyEmailBody(token: string) {
  const url = `${APP_URL}/gestionale/verifica-email?token=${encodeURIComponent(token)}`;
  return {
    subject: "Conferma il tuo indirizzo email NaBoat",
    text: `Benvenuto in NaBoat.\n\nConferma la tua email aprendo questo link (valido 48 ore):\n${url}\n\nSe non hai richiesto tu la registrazione, ignora questo messaggio.`,
    html: `<p>Benvenuto in NaBoat.</p><p>Conferma la tua email aprendo questo link (valido 48 ore):</p><p><a href="${url}">${url}</a></p><p>Se non hai richiesto tu la registrazione, ignora questo messaggio.</p>`,
  };
}

// Invito a un collaboratore: sceglie la password e conferma l'email in un solo passaggio.
export function invitoBody(link: string) {
  const url = escapeHtml(link);
  return {
    subject: "Il tuo invito a NaBoat",
    text: `Sei stato invitato a collaborare su NaBoat.\n\nScegli la password del tuo account aprendo questo link (valido 72 ore):\n${link}\n\nSe non riconosci questo invito, ignora questo messaggio.`,
    html: `<p>Sei stato invitato a collaborare su <b>NaBoat</b>.</p><p>Scegli la password del tuo account aprendo questo link (valido <b>72 ore</b>):</p><p><a href="${url}">${url}</a></p><p>Se non riconosci questo invito, ignora questo messaggio.</p>`,
  };
}

// Conferma dell'email dell'account cliente finale.
export function clienteVerificaBody(link: string) {
  const url = escapeHtml(link);
  return {
    subject: "Conferma il tuo indirizzo email NaBoat",
    text: `Benvenuto in NaBoat.\n\nConferma la tua email aprendo questo link (valido 48 ore):\n${link}\n\nSe non hai richiesto tu la registrazione, ignora questo messaggio.`,
    html: `<p>Benvenuto in NaBoat.</p><p>Conferma la tua email aprendo questo link (valido <b>48 ore</b>):</p><p><a href="${url}">${url}</a></p><p>Se non hai richiesto tu la registrazione, ignora questo messaggio.</p>`,
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

  const cliente = escapeHtml(d.cliente);
  const barca = escapeHtml(d.barca);
  const destinazione = escapeHtml(d.destinazione);
  const puntoPartenza = escapeHtml(d.puntoPartenza);
  const telefono = escapeHtml(d.telefono);
  const azienda = escapeHtml(d.azienda);
  const contrattoUrl = d.contrattoUrl ? encodeURI(d.contrattoUrl) : null;

  return {
    subject: subjectSicuro(`Promemoria: la tua uscita di domani con ${d.azienda}`),
    text: righe.join("\n"),
    html: `<p>Ciao ${cliente},</p><p>ti ricordiamo la tua uscita in mare di <b>domani</b>:</p>
<ul>
  <li>Imbarcazione: <b>${barca}</b></li>
  <li>Quando: <b>${escapeHtml(d.quando)}</b></li>
  <li>Passeggeri: <b>${escapeHtml(d.passeggeri)}</b></li>${d.destinazione ? `\n  <li>Destinazione: <b>${destinazione}</b></li>` : ""}${d.puntoPartenza ? `\n  <li>Punto di partenza: <b>${puntoPartenza}</b></li>` : ""}
</ul>
<p><b>Cosa portare:</b> documento d'identità, patente nautica se richiesta, crema solare e acqua.<br>
Ti consigliamo di arrivare <b>15 minuti prima</b> della partenza.</p>
${contrattoUrl ? `<p>Contratto da firmare online: <a href="${escapeHtml(contrattoUrl)}">${escapeHtml(contrattoUrl)}</a></p>` : ""}
${d.telefono ? `<p>Per qualsiasi necessità: <b>${telefono}</b></p>` : ""}
<p>A domani!<br><b>${azienda}</b></p>`,
  };
}

// Invio del contratto di noleggio da leggere e firmare online.
export function contrattoBody(d: { azienda: string; cliente: string; url: string }) {
  const cliente = escapeHtml(d.cliente);
  const azienda = escapeHtml(d.azienda);
  const url = escapeHtml(d.url);
  return {
    subject: subjectSicuro(`Contratto di noleggio da firmare — ${d.azienda}`),
    text: `Ciao ${d.cliente},\n\necco il contratto di noleggio da leggere e firmare online:\n${d.url}\n\nSe hai domande puoi rispondere a questa email o contattare ${d.azienda}.`,
    html: `<p>Ciao ${cliente},</p><p>ecco il contratto di noleggio da leggere e firmare online:</p><p><a href="${url}">${url}</a></p><p>Se hai domande puoi rispondere a questa email o contattare <b>${azienda}</b>.</p>`,
  };
}

// Reset password: link monouso valido 1 ora.
export function resetPasswordBody(token: string) {
  const url = `${APP_URL}/gestionale/reimposta-password?token=${encodeURIComponent(token)}`;
  return {
    subject: "Reimposta la password di NaBoat",
    text: `Hai chiesto di reimpostare la password del tuo account NaBoat.\n\nApri questo link (valido 1 ora):\n${url}\n\nSe non hai richiesto tu il cambio, ignora questo messaggio: la password resta quella di prima.`,
    html: `<p>Hai chiesto di reimpostare la password del tuo account NaBoat.</p><p>Apri questo link (valido <b>1 ora</b>):</p><p><a href="${url}">${url}</a></p><p>Se non hai richiesto tu il cambio, ignora questo messaggio: la password resta quella di prima.</p>`,
  };
}

// Reset password del cliente finale.
export function resetPasswordClienteBody(token: string) {
  const url = `${APP_URL}/area/reset?token=${encodeURIComponent(token)}`;
  return {
    subject: "Reimposta la password del tuo account NaBoat",
    text: `Hai chiesto di reimpostare la password del tuo account cliente NaBoat.\n\nApri questo link (valido 1 ora):\n${url}\n\nSe non hai richiesto tu il cambio, ignora questo messaggio.`,
    html: `<p>Hai chiesto di reimpostare la password del tuo account cliente NaBoat.</p><p>Apri questo link (valido <b>1 ora</b>):</p><p><a href="${url}">${url}</a></p><p>Se non hai richiesto tu il cambio, ignora questo messaggio.</p>`,
  };
}

type DatiRichiesta = {
  azienda: string;
  barca: string;
  cliente: string;
  telefono: string;
  quando: string;
  passeggeri: number;
  note?: string | null;
};

// Al noleggiatore: è arrivata una richiesta dal sito.
export function richiestaRicevutaBody(d: DatiRichiesta) {
  const righe = [
    "Hai ricevuto una nuova richiesta dal sito NaBoat.",
    "",
    `Barca: ${d.barca}`,
    `Cliente: ${d.cliente} · ${d.telefono}`,
    `Quando: ${d.quando}`,
    `Passeggeri: ${d.passeggeri}`,
  ];
  if (d.note) righe.push("", "Note:", d.note);
  righe.push("", `Aprila nel gestionale per confermarla o rifiutarla.`, d.azienda);
  const esc = (v: unknown) => escapeHtml(v);
  return {
    subject: subjectSicuro(`Nuova richiesta di prenotazione — ${d.barca}`),
    text: righe.join("\n"),
    html: `<p>Hai ricevuto una <b>nuova richiesta</b> dal sito NaBoat.</p>
<ul>
  <li>Barca: <b>${esc(d.barca)}</b></li>
  <li>Cliente: <b>${esc(d.cliente)}</b> · ${esc(d.telefono)}</li>
  <li>Quando: <b>${esc(d.quando)}</b></li>
  <li>Passeggeri: <b>${d.passeggeri}</b></li>
</ul>${d.note ? `<p><b>Note:</b><br>${esc(d.note).replace(/\n/g, "<br>")}</p>` : ""}
<p>Aprila nel gestionale per confermarla o rifiutarla.</p><p><b>${esc(d.azienda)}</b></p>`,
  };
}

// Al cliente: esito della richiesta (confermata o rifiutata).
export function richiestaEsitoBody(d: { cliente: string; barca: string; azienda: string; quando: string; confermata: boolean; telefono?: string | null }) {
  const esc = (v: unknown) => escapeHtml(v);
  const esito = d.confermata ? "confermata" : "non disponibile";
  const righe = [
    `Ciao ${d.cliente},`,
    "",
    d.confermata ? `la tua richiesta è stata confermata.` : `la tua richiesta purtroppo non è stata accettata.`,
    `  • Barca: ${d.barca}`,
    `  • Quando: ${d.quando}`,
    `  • Azienda: ${d.azienda}`,
  ];
  if (d.confermata && d.telefono) righe.push("", `Per qualsiasi necessità contatta l'azienda: ${d.telefono}`);
  righe.push("", "Grazie,", "NaBoat");
  return {
    subject: subjectSicuro(d.confermata ? `La tua richiesta è confermata — ${d.barca}` : `Esito della tua richiesta — ${d.barca}`),
    text: righe.join("\n"),
    html: `<p>Ciao ${esc(d.cliente)},</p><p>${d.confermata ? "la tua richiesta è stata <b>confermata</b>." : "la tua richiesta purtroppo <b>non è stata accettata</b>."}</p>
<ul><li>Barca: <b>${esc(d.barca)}</b></li><li>Quando: <b>${esc(d.quando)}</b></li><li>Azienda: <b>${esc(d.azienda)}</b></li></ul>
${d.confermata && d.telefono ? `<p>Per qualsiasi necessità contatta l'azienda: <b>${esc(d.telefono)}</b></p>` : ""}
<p>Grazie,<br><b>NaBoat</b></p><p style="color:#888;font-size:12px">Esito: ${esito}</p>`,
  };
}

// Al titolare: esito della richiesta di registrazione dell'azienda.
export function tenantStatoBody(d: { azienda: string; stato: "active" | "suspended" | "pending" | "rejected" }) {
  const esc = (v: unknown) => escapeHtml(v);
  const testi: Record<typeof d.stato, { subject: string; intro: string }> = {
    active: { subject: "La tua azienda è attiva su NaBoat", intro: "La tua azienda è stata approvata: puoi accedere al gestionale e iniziare a lavorare." },
    suspended: { subject: "La tua azienda è stata sospesa su NaBoat", intro: "L'accesso alla tua azienda è stato sospeso. Per chiarimenti rispondi a questa email." },
    pending: { subject: "Registrazione azienda su NaBoat", intro: "La richiesta di registrazione è in attesa di approvazione." },
    rejected: { subject: "Registrazione azienda non accettata", intro: "La richiesta di registrazione della tua azienda non è stata accettata." },
  };
  const t = testi[d.stato];
  const righe = [`Ciao,`, "", t.intro, "", `Azienda: ${d.azienda}`, "", "NaBoat"];
  return {
    subject: subjectSicuro(t.subject),
    text: righe.join("\n"),
    html: `<p>Ciao,</p><p>${esc(t.intro)}</p><p><b>Azienda:</b> ${esc(d.azienda)}</p><p>NaBoat</p>`,
  };
}

// Al titolare: un incasso è andato a buon fine.
export function incassoBody(d: { azienda: string; descrizione: string; importo: string }) {
  const esc = (v: unknown) => escapeHtml(v);
  return {
    subject: subjectSicuro(`Incasso registrato — ${d.descrizione}`),
    text: [`È stato registrato un incasso.`, "", `Descrizione: ${d.descrizione}`, `Importo: ${d.importo}`, "", d.azienda].join("\n"),
    html: `<p>È stato registrato un <b>incasso</b>.</p><p>Descrizione: <b>${esc(d.descrizione)}</b><br>Importo: <b>${esc(d.importo)}</b></p><p>${esc(d.azienda)}</p>`,
  };
}
