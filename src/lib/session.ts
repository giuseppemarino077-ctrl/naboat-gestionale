import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";

const COOKIE = "nb_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7gg

// Il gettone vale per tutto il dominio .naboat.it: la sessione aperta sul portale
// è riconosciuta anche dal sito (e viceversa). In sviluppo resta legata all'indirizzo locale.
async function dominioCookie(): Promise<string | undefined> {
  const h = await headers();
  const host = (h.get("host") ?? "").toLowerCase().split(":")[0];
  return host === "naboat.it" || host.endsWith(".naboat.it") ? ".naboat.it" : undefined;
}

export type SessionPayload = {
  sub: string; // userId
  tenantId: string | null;
  role: string;
  tenantStatus: string | null;
  twofa: boolean; // requisito 2FA soddisfatto per questa sessione
};

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET mancante o troppo corto (>=32 char)");
  return new TextEncoder().encode(s);
}

export async function createSession(p: SessionPayload) {
  const token = await new SignJWT({ ...p })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
    domain: await dominioCookie(),
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function clearSession() {
  const store = await cookies();
  store.set(COOKIE, "", { path: "/", maxAge: 0, domain: await dominioCookie() });
}
