# NaBoat Gestionale (D3 — handover)

Monolite Next.js 15 + Postgres + Redis + Caddy su singolo VPS. Vedi `PERIMETRO.md` (D1) e `DEPLOY.md` (deploy/backup/DNS/sicurezza).

## Avvio locale
1. `docker compose up -d db redis` (porte 5434/6380 via override)
2. `npx prisma migrate dev` · `npm run db:seed` (crea superadmin)
3. `npm run dev` → http://localhost:3000 (login `admin@naboat.it` / password in `.env.local`)

## Dati di test
`npm run db:seed:test` ricrea la demo su tenant Golfo Charter Test: 3 barche
(Gozzo Sorrentino 7.5, Open 21 Premium con patente+skipper, Gommone 650),
2 skipper, 3 extra, 4 clienti, 6 prenotazioni relative a oggi (3 uscite odierne,
1 in mare, 1 rientrata ieri, 1 futura) + 1 blocco manutenzione.
Le foto demo si caricano a parte via `POST /api/v1/uploads` (vedi `img/`).
Fonti foto: Unsplash (licenza libera) + asset del sito NaBoat.

## Foto barche e galleria
`POST /api/v1/uploads` (multipart file+boatId, max 5MB jpeg/png/webp); galleria su scheda Flotta con copertina ★, lightbox, eliminazione. Storage: `STORAGE_DRIVER=local` (disco, volume `./uploads`, default) oppure `s3` (Aruba Object Storage via env S3_*).

## Sicurezza implementata
- Sessioni JWT httpOnly (jose), 2FA TOTP (`/sicurezza`), verifica email proprietario.
- Rate-limit su Redis (login 20/10min per IP + 10/10min per email; register 5/ora).
- Turnstile su login/registrazione (attivo se `TURNSTILE_SECRET` configurato).
- Header CSP/HSTS/Permissions-Policy; `npm audit` = 0 vulnerabilità.
- Flag: `REQUIRE_2FA`, `REQUIRE_EMAIL_VERIFY` (true in produzione).

## Script operativi
- `node scripts/smoke-test.mjs [baseUrl]` — test end-to-end delle API (27 check).
- `node scripts/offsite-backup.mjs` — copia i dump su S3/Aruba Object Storage.
- `bash scripts/restore-drill.sh` — ripristina l'ultimo dump su DB separato e verifica.

## Credenziali/segreti
`.env` (container) e `.env.local` (host) non committati. In prod rigenerare `AUTH_SECRET` (>=32 char), `POSTGRES_PASSWORD`, `SUPERADMIN_PASSWORD`. RLS: vedi `prisma/rls.sql` e `DEPLOY.md` §8 (attivazione dedicata).

## Struttura
`src/app` pagine (oggi, calendario, flotta, clienti, team, sicurezza, admin, login, registrazione, verifica-email) + API `src/app/api/v1/*`; `src/lib` (db, session, tenant, guard, ratelimit, totp, turnstile, mailer, storage); `prisma/` schema + migration + seed.
