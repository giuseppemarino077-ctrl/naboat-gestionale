import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";

// Due cookie distinti, per non far cancellare la sessione di un ruolo quando si accede
// con l'altro sullo stesso browser:
// - nb_session: operatore dell'azienda (owner/operatore/skipper) e superadmin NaBoat;
// - nb_cliente: cliente finale dell'area personale (account di piattaforma).
const COOKIE = "nb_session";
const COOKIE_CLIENTE = "nb_cliente";
const MAX_AGE = 60 * 60 * 24 * 7; // 7gg

// Il gettone vale per tutto il dominio .naboat.it: la sessione aperta sul portale
// è riconosciuta anche dal sito (e viceversa). In sviluppo resta legata all'indirizzo locale.
async function dominioCookie(): Promise<string | undefined> {
  const h = await headers();
  const host = (h.get("host") ?? "").toLowerCase().split(":")[0];
  return host === "naboat.it" || host.endsWith(".naboat.it") ? ".naboat.it" : undefined;
}

export type SessionPayload = {
  sub: string; // userId (operatore) oppure accountId (cliente finale)
  tenantId: string | null;
  role: string;
  tenantStatus: string | null;
  twofa: boolean; // requisito 2FA soddisfatto per questa sessione
  ver?: number; // versione della sessione (User/ClienteAccount.sessionVersion): cambiarla invalida i gettoni
};

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET mancante o troppo corto (>=32 char)");
  return new TextEncoder().encode(s);
}

// Opzioni comuni dei due cookie: httpOnly, SameSite=lax, secure in produzione
// e stesso dominio .naboat.it (così portale e sito condividono l'accesso).
async function opzioniCookie(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
    domain: await dominioCookie(),
  };
}

async function firma(p: SessionPayload): Promise<string> {
  return new SignJWT({ ...p })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

async function leggi(nome: string): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(nome)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

// Sessione dell'operatore: scrive solo nb_session, non tocca quella del cliente.
export async function createSession(p: SessionPayload) {
  const token = await firma(p);
  const store = await cookies();
  store.set(COOKIE, token, await opzioniCookie(MAX_AGE));
}

// Sessione del cliente finale: cookie separato (nb_cliente), così non tocca l'operatore.
export async function createClienteSession(p: SessionPayload) {
  const token = await firma(p);
  const store = await cookies();
  store.set(COOKIE_CLIENTE, token, await opzioniCookie(MAX_AGE));
}

// Sessione operatore (gestionale). Se non c'è, ricade su quella del cliente: gli
// ingressi pubblici che leggono l'identità del cliente (es. POST /api/v1/richieste)
// usano getSession(), che deve continuare a riconoscere il cliente autenticato.
// Le guardie verificano comunque ruolo e utente sul database, quindi la ricaduta
// non può diventare un accesso al gestionale (l'id del cliente non è un User).
export async function getSession(): Promise<SessionPayload | null> {
  const operatore = await leggi(COOKIE);
  if (operatore) return operatore;
  return leggi(COOKIE_CLIENTE);
}

// Sessione del cliente finale: legge SOLO nb_cliente (requireCliente non usa mai nb_session).
export async function getClienteSession(): Promise<SessionPayload | null> {
  return leggi(COOKIE_CLIENTE);
}

// Il logout dell'operatore spegne solo la propria sessione.
export async function clearSession() {
  const store = await cookies();
  store.set(COOKIE, "", { path: "/", maxAge: 0, domain: await dominioCookie() });
}

// Il logout del cliente spegne solo la propria sessione.
export async function clearClienteSession() {
  const store = await cookies();
  store.set(COOKIE_CLIENTE, "", { path: "/", maxAge: 0, domain: await dominioCookie() });
}
