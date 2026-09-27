import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { hostSito, percorsoPubblicoSito } from "@/lib/sito";

// Le pagine del gestionale richiedono l'accesso: senza sessione si viene portati al login.
// (La verifica vera del gettone resta nelle API: qui si evita solo di mostrare pagine vuote.)
const PUBBLICHE = ["/login", "/registrazione", "/verifica-email", "/password-dimenticata", "/reimposta-password", "/paga", "/contratto", "/contratto-ormeggio"];
const NON_PAGINE = ["/_next", "/api", "/uploads", "/img", "/icon", "/apple-touch-icon", "/manifest", "/robots", "/sitemap", "/favicon"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") ?? "";

  if (NON_PAGINE.some((p) => pathname.startsWith(p))) return NextResponse.next();
  // Qualsiasi file (immagini, icone, css, js, xml, txt…) passa sempre: non è una pagina.
  if (/\.[a-z0-9]{2,5}$/i.test(pathname)) return NextResponse.next();

  // Le pagine del sito pubblico (home, Chi siamo, Contatti) sono aperte a tutti.
  if (hostSito(host) && percorsoPubblicoSito(pathname)) return NextResponse.next();

  if (PUBBLICHE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  const sessione = req.cookies.get("nb_session")?.value;
  if (!sessione) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?da=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
