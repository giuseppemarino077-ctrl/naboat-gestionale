// Sito pubblico (naboat.it) e portale (app.naboat.it) vivono nella stessa applicazione.
// Qui stanno le regole condivise per distinguere i due indirizzi.
// Attenzione: questo file non deve importare il database (lo usa anche il middleware).

export const DOMINIO_SITO = "https://naboat.it";

// Sondaggio pubblico (modulo Google): unico punto da cambiare se il link cambia.
export const LINK_SONDAGGIO =
  "https://docs.google.com/forms/d/e/1FAIpQLSftpEBun2odfFqGrd3R4B-IvxkcJn8ME3q8JWZCvuhk1l1dEw/viewform";

// Percorsi del sito pubblico serviti senza accesso sul dominio del sito.
// Le pagine informative, il catalogo e le schede non cambiano indirizzo.
export const PERCORSI_SITO = ["/", "/chi-siamo", "/contatti", "/progetto", "/privacy", "/cookie", "/termini", "/noleggia", "/per-noleggiatori", "/barca", "/azienda"];

// Prefisso del gestionale: tutto il portale operativo (noleggio, ormeggio, impostazioni)
// vive sotto /gestionale, separato dal sito pubblico e dall'area cliente.
export const PREFISSO_GESTIONALE = "/gestionale";

// Presentazione del progetto (vecchio sito, copia statica in public/progetto).
export const LINK_PROGETTO = "/progetto";

export function nomeHost(host: string): string {
  return host.toLowerCase().split(":")[0];
}

// I due indirizzi pubblici ufficiali (in produzione).
export function dominioPubblico(host: string): boolean {
  const h = nomeHost(host);
  return h === "naboat.it" || h === "www.naboat.it";
}

// Dove si comporta da sito pubblico: i due indirizzi ufficiali e, in sviluppo, il computer locale.
export function hostSito(host: string): boolean {
  const h = nomeHost(host);
  return dominioPubblico(host) || h === "localhost" || h === "127.0.0.1";
}

export function percorsoPubblicoSito(pathname: string): boolean {
  if (pathname === "/") return true;
  return PERCORSI_SITO.some((p) => p !== "/" && (pathname === p || pathname.startsWith(`${p}/`)));
}

// Indirizzo del portale a cui puntano i pulsanti «Accedi» e «Registra».
// Sito e portale vivono sullo stesso dominio (naboat.it), quindi i collegamenti restano relativi.
export function appBase(_host: string): string {
  return "";
}

export const HOME_PREDEFINITA = {
  titolo: "Il mare è la meta. Noi pensiamo al resto.",
  sottotitolo:
    "Le aziende di noleggio e le loro barche, in un unico posto. Prezzi chiari, pagamenti sicuri, skipper quando serve.",
  immagine: "/img/sfondo-login.jpg",
};

export const MANUTENZIONE_PREDEFINITA = {
  titolo: "Stiamo preparando il portale.",
  testo:
    "Il nuovo sito NaBoat per il noleggio barche a Napoli, Capri, Ischia, Procida e Salerno sarà online a breve. Per informazioni scrivici: ti rispondiamo entro un giorno lavorativo.",
  immagine: "/img/sfondo-login.jpg",
};
