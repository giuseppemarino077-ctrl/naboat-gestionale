# NaBoat Gestionale (D3 — handover)

Monolite Next.js 15 + Postgres + Redis + Caddy su singolo VPS. Vedi `PERIMETRO.md` (D1) e `DEPLOY.md` (deploy/backup/DNS/sicurezza).

## Avvio locale

Per riprendere il lavoro su Mac, fai doppio clic su **`Avvia NaBoat.command`**
nella cartella del progetto, oppure esegui `npm run avvia`.
Il collegamento apre Docker Desktop se necessario, avvia PostgreSQL e Redis,
controlla le migrazioni, genera il client Prisma e avvia il server su
http://localhost:3000 aprendo la pagina di accesso nel browser. Se il server
di questo progetto è già acceso lo riutilizza. Lascia aperto il terminale;
`Ctrl+C` ferma il server, mentre database e cache rimangono disponibili.
Richiede Node.js, Docker Desktop, dipendenze installate (`npm ci`) e i file
`.env` / `.env.local` configurati. Non applica migrazioni né esegue seed:
se il database non è aggiornato, si ferma mostrando il problema.

Per la prima configurazione o per intervenire manualmente:

1. `docker compose up -d db redis` (porte 5434/6380 via override)
2. `npx prisma migrate dev` · `npm run db:seed` (crea superadmin)
3. `npm run dev` → http://localhost:3000 (login `admin@naboat.it` / password in `.env.local`)

## Verifiche
```bash
npm run typecheck   # TypeScript, 0 errori
npm run lint        # ESLint, 0 errori (restano warning storici)
npm run test:isolated
```

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
- Sessioni JWT httpOnly (jose), 2FA TOTP (`/gestionale/impostazioni/sicurezza`), verifica email proprietario.
- Rate-limit su Redis (login 20/10min per IP + 10/10min per email; register 5/ora).
- Turnstile su login/registrazione (attivo se `TURNSTILE_SECRET` configurato).
- Header CSP/HSTS/Permissions-Policy; lo stato delle vulnerabilità va ricontrollato al rilascio.
- Flag: `REQUIRE_2FA`, `REQUIRE_EMAIL_VERIFY` (true in produzione).

## Script operativi
- `npm run check:boundaries` — verifica import diretti/transitivi e guardie dei prodotti.
- `npm run test:isolated` — build e test end-to-end generale, Ormeggio, Oggi e regressioni su database temporaneo.
- `node scripts/offsite-backup.mjs` — copia i dump su S3/Aruba Object Storage.
- `bash scripts/restore-drill.sh` — ripristina l'ultimo dump su DB separato e verifica.

## Credenziali/segreti
`.env` (container) e `.env.local` (host) non committati. In prod rigenerare `AUTH_SECRET` (>=32 char), `POSTGRES_PASSWORD`, `SUPERADMIN_PASSWORD`. RLS: vedi `prisma/rls.sql` e `DEPLOY.md` §8 (attivazione dedicata).

## Struttura
Un solo progetto Next.js con aree distinte da segmenti di percorso (mappa completa in `MIGRAZIONE-URL.md`):
- **Sito pubblico**: `src/app/(sito)/*` (home, Chi siamo, Contatti, Noleggia, `/barca/[slug]`, `/azienda/[slug]`, pagine legali).
- **Gestionale**: `src/app/gestionale/(portale)/*` (`/gestionale/oggi`, `/gestionale/calendario`, `/gestionale/prenotazioni`, `/gestionale/flotta`, `/gestionale/clienti`, `/gestionale/economia/…`, `/gestionale/ormeggio/…`, `/gestionale/impostazioni/…`).
- **Pannello NaBoat**: `src/app/admin/*`. **Area cliente**: `src/app/area/*`. **Azioni per token**: `/paga/[token]`, `/contratto/[token]`.
- API `src/app/api/v1/*` come adattatori; servizi, schermate e componenti dei prodotti in `src/modules/noleggio` e `src/modules/ormeggio`, servizi comuni in `src/modules/piattaforma`. Infrastruttura tecnica e compatibilità in `src/lib/*`; `prisma/` contiene schema, migrazioni e seed. Mappa e regole: [Separazione dei moduli](docs/SEPARAZIONE-MODULI.md).

## Liste e paginazione
Le liste di prenotazioni, clienti, spese e incassi sono paginabili dal database: con `?page=` (e `?limit=`) rispondono `{ items, totale, pagina, dimensione, pagine }`; senza `page` restano un array (forma storica) con l'header `X-Total-Count` e un tetto di righe documentato. Il calendario accetta una finestra massima di 180 giorni.


## Collaudo isolato

`npm run test:isolated` richiede PostgreSQL e Redis locali attivi. Crea un database
vuoto con nome casuale, applica tutte le migrazioni, prepara account temporanei e
esegue build e smoke su una copia del codice. Database, server e upload temporanei
vengono rimossi alla fine. Non usa credenziali Stripe/SMTP reali e non svuota Redis.
Vedi `docs/STABILIZZAZIONE.md` per limiti e risultati.

Gli script rifiutano database persistenti e indirizzi diversi dal server del
collaudo, compreso localhost:3000. Non creare prove automatiche negli account
reali o demo: solo le prove inserite dalle persone devono rimanere visibili.
Per residui storici: `node --env-file=.env.local scripts/demo-pulisci.mjs`
mostra l’anteprima; aggiungere `--conferma` applica la pulizia in transazione.
Fare prima un backup. Le firme combinano nome, identità e timestamp: i nomi
«test» o «Smoke» da soli non bastano; identità condivise e casi dubbi restano.
