/** @type {import('next').NextConfig} */

// CSP pragmatica: Next inietta script inline per l'idratazione, quindi serve
// 'unsafe-inline' su script/style. Restano bloccati oggetti, frame esterni,
// form action esterni e connessioni a terze parti (eccetto Turnstile CF).
// In sviluppo Next usa eval per l'HMR: senza 'unsafe-eval' il client non si
// idrata e i form non rispondono (in produzione la CSP resta invariata).
const EVAL_SVILUPPO = process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : "";
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${EVAL_SVILUPPO} https://challenges.cloudflare.com`,
  "connect-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

// Compatibilità: i vecchi indirizzi del portale (compresi i link già inviati per email)
// puntano ai nuovi segmenti. I parametri di query vengono mantenuti automaticamente.
// 307 (temporaneo): non si consolida nella cache dei browser durante la transizione.
const REDIRECT_VECCHI = [
  ["/login", "/gestionale/accesso"],
  ["/registrazione", "/gestionale/registrazione"],
  ["/invito", "/gestionale/invito"],
  ["/verifica-email", "/gestionale/verifica-email"],
  ["/password-dimenticata", "/gestionale/password-dimenticata"],
  ["/reimposta-password", "/gestionale/reimposta-password"],
  ["/in-attesa", "/gestionale/stato"],
  ["/oggi", "/gestionale/oggi"],
  ["/calendario", "/gestionale/calendario"],
  ["/turni", "/gestionale/skipper"],
  ["/meteo", "/gestionale/meteo"],
  ["/flotta", "/gestionale/flotta"],
  ["/manutenzione", "/gestionale/manutenzione"],
  ["/clienti", "/gestionale/clienti"],
  ["/registro", "/gestionale/registro"],
  ["/recensioni", "/gestionale/recensioni"],
  ["/pagamenti", "/gestionale/economia/pagamenti"],
  ["/resoconto", "/gestionale/economia/resoconto"],
  ["/impostazioni", "/gestionale/impostazioni"],
  ["/team", "/gestionale/impostazioni/team"],
  ["/listino", "/gestionale/impostazioni/listino"],
  ["/porti", "/gestionale/impostazioni/porti"],
  ["/sicurezza", "/gestionale/impostazioni/sicurezza"],
  ["/abbonamento", "/gestionale/impostazioni/piano"],
  ["/anteprima", "/admin/anteprima"],
];

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // Vecchi URL → nuovi segmenti (le pagine con sottopercorsi usano :path*).
  async redirects() {
    const fissi = REDIRECT_VECCHI.map(([source, destination]) => ({ source, destination, permanent: false }));
    return [
      ...fissi,
      { source: "/prenotazioni/:path*", destination: "/gestionale/prenotazioni/:path*", permanent: false },
      { source: "/ormeggio/:path*", destination: "/gestionale/ormeggio/:path*", permanent: false },
    ];
  },
  // La presentazione del progetto è una copia statica in public/progetto:
  // senza questa regola l'indirizzo pulito /progetto non verrebbe servito.
  async rewrites() {
    return [{ source: "/progetto", destination: "/progetto/index.html" }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
