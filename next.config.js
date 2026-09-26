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

const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
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
