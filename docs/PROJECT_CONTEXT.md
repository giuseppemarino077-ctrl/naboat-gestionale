# PROJECT_CONTEXT.md — NaBoat Gestionale

Contesto operativo per il passaggio a un nuovo agente AI. **Regole di modifica e
comandi**: vedi [`AGENTS.md`](../AGENTS.md). Qui c'è lo stato del progetto:
architettura, cosa è fatto, cosa manca, problemi noti, decisioni prese, servizi
esterni, variabili d'ambiente (solo nomi), test e prossimi passi.

Ultimo aggiornamento: 12 ottobre 2026.

---

## 1. Cos'è

Gestionale **multi-tenant** per aziende nautiche, in italiano. Due moduli separati
ma comunicanti:

- **Noleggio** (rivolto al marketplace pubblico): prenotazioni, calendario, flotta,
  clienti, economia, area cliente finale.
- **Ormeggio/custodia** (gestionale interno): posti, permanenze, movimenti,
  attività, addebiti. **Non** esposto al pubblico (in futuro un'app/prenotazione
  self-service per i privati).

Ogni azienda (tenant) vede solo i propri dati. NaBoat (superadmin) gestisce la
piattaforma dal pannello `/admin`.

---

## 2. Architettura e struttura

**Monolite Next.js 15 (App Router) + React 19 + TypeScript**, con pagine e API nello
stesso progetto.

- **DB**: PostgreSQL 15 + Prisma 5 (`prisma/schema.prisma`, migrazioni in
  `prisma/migrations/`).
- **Cache/rate-limit**: Redis.
- **Stile**: Tailwind CSS 3 (token NaBoat: deep `#052f3f`, ocean `#087f8c`, sea
  `#23a6a6`).
- **Auth**: JWT (jose) in cookie httpOnly `nb_session`, bcrypt, TOTP (2FA).
- **Isolamento tenant**: **applicativo** (ogni query filtra `tenantId`). RLS
  **spenta** (`RLS_ENABLED=false`); client `conTenant()`/`prismaPiattaforma()`
  pronti per una futura attivazione.
- **Deploy**: singolo VPS con Caddy (TLS) davanti all'app; DB/Redis in Docker.
  Dettagli in `DEPLOY.md`.

**Gruppi di rotte** (`src/app/`):

| Gruppo | Contenuto |
|---|---|
| `(sito)` | Sito pubblico: home, Chi siamo, Contatti, `/noleggia`, `/azienda/[slug]`, `/barca/[slug]`, `/per-noleggiatori`, legali |
| `(pubblico)` | Pagine con solo token: `/contratto/[token]`, `/contratto-ormeggio/[token]`, `/paga/[token]` |
| `gestionale/(accesso)` | Login/registrazione |
| `gestionale/(portale)` | Portale azienda (oggi, calendario, flotta, ormeggio, economia, impostazioni…) |
| `gestionale/(stato)` | Pagine per azienda non ancora attiva |
| `admin` | Pannello NaBoat (superadmin) |
| `area` | Area cliente finale (piattaforma) |
| `api/v1` | API REST; `api/healthz`, `api/readyz`, `api/version` |

**Cartelle chiave**:

- `src/modules/` — servizi, operazioni API, schermate e componenti posseduti da Noleggio/Ormeggio; piattaforma comune per accesso, documenti, provider pagamenti e resoconti. Adattatori URL in `src/app`. Dettagli e verifiche in `docs/SEPARAZIONE-MODULI.md`.
- `src/lib/` — logica condivisa (db, session, tenant, guard, ratelimit, paginazione,
  totp, turnstile, mailer, storage, payments, marketplace, ormeggio, reports, seo,
  barche, modelli-barche, opzioni-barche, …).
- `src/components/` — `ui/`, `sito/`, `calendario/`, `admin/`, `ormeggio/`.
- `prisma/` — schema + seed (`seed.mjs`, `seed-test.mjs`).
- `scripts/` — smoke test, backup/ripristino, demo, verifiche (RLS, oggi).
- `docs/` — questa documentazione + `parita-boatly.md`.

**Un solo dominio** (`naboat.it`): sito pubblico e portale convivono; `app.naboat.it`
reindirizza. Regole in `src/lib/sito.ts` (non importa il DB: lo usa il middleware).

---

## 3. Funzionalità completate

**Identità e accesso**
- Registrazione azienda, approvazione NaBoat, verifica email, inviti collaboratori.
- Ruoli: `owner`, `operatore`, `skipper` (solo lettura GET), `cliente`, `superadmin`.
  Ormeggio usa appartenenze aziendali con profili Responsabile e Addetto,
  accesso ai prodotti e permesso economico per appartenenza. Il precedente profilo
  Visualizzazione è ritirato; il titolare deve riassegnare gli eventuali accessi.
- 2FA TOTP, reset password, permesso `vedeImporti`.

**Noleggio**
- Calendario (Giorno/Settimana/Mese/Agenda, filtro porto), planning 45 giorni.
- Flotta: pubblicazione/ritiro, pausa, galleria foto, porto e modello, archiviazione,
  piano Free/Pro (402 sui limiti).
- Prenotazioni: stati e transizioni, doppia prenotazione prevenuta a livello DB
  (`booking_no_overlap` + advisory lock in transazione), storico con autore.
- Clienti, richieste d'opzione con scadenza, listino/tariffe, extra.
- Economia/report: incassi, spese, margine (CSV con BOM).

**Marketplace e area cliente**
- Profili pubblici azienda/barca, catalogo `/noleggia`, recensioni (moderazione),
  richieste pubbliche, patente (foto in archivio privato, numero cifrato).
- Area cliente di piattaforma (`ClienteAccount`), prenotazioni, patente, recensioni.
- SEO pubblica con `SeoPage`, sitemap e robots consapevoli del dominio.

**Pagamenti (Stripe)**
- Account per azienda, chiavi cifrate a riposo (AES-256-GCM da `AUTH_SECRET`).
- Cauzione con blocco carta (`capture_method=manual`), link pubblico `/paga/[token]`,
  webhook con verifica firma.
- Abbonamento gestionale (attivazione + manutenzione) e fee marketplace; listino in
  `PlatformSettings` con override per azienda.

**Ormeggio/custodia (fasi O1–O4)**
- Aree/posti (griglia «battaglia navale»), permanenze, movimenti, attività, addebiti.
- Doppie assegnazioni impedite a DB (`EXCLUDE USING gist`); spostamenti con storia.
- Documento/contratto ormeggio, check-in/out con foto, catalogo servizi, conti.
- Conto: «Segna pagato» registra un incasso collegato alla voce, al netto degli
  acconti già presenti; saldo condiviso con Economia, PDF, contratto e Statistiche.
- **Ultimo lavoro (non committato)**: statistiche con dati reali, appartenenze
  multi-azienda, collaboratori e inviti, profili operativi/TV, revisioni e
  idempotenza. Restano inclusi i precedenti interventi su griglia, catalogo e
  attività Lista/Kanban/archivio (vedi §10 e aggiornamenti in fondo).

**Piattaforma/infrastruttura**
- Backup governati dal pannello (`/admin/backup` → orchestratore), verifica con prova
  di ripristino, registro completo (`AuditLog` con prima/dopo).
- `healthz` (liveness) e `readyz` (DB/Redis) separati.
- CI GitHub Actions: lint, typecheck, migrazioni su DB vuoto, build.

---

## 4. Funzionalità incomplete / in corso

- **Modulo Ormeggio**: in costruzione. Restano la **prenotazione autonoma del privato**
  (app o web self-service), la disponibilità/assegnazione automatica dei posti e le
  eventuali fasi successive (O5+). Oggi è solo gestionale interno.
- **Piano Free/Pro**: `pianoProvaGiorni` e `pianoProPrezzo*` esistono ma **non sono
  collegati** a pagamenti/scadenze automatiche; il passaggio a Pro è **manuale**.
- **Impostazioni non collegate**: `sogliaPatenteCv` è in `PlatformSettings` ma non
  produce effetti (l'obbligo patente dipende da `Boat.patenteRichiesta`).
- **Test visivi browser**: rimandati al proprietario; la verifica automatica è via
  API + build.
- **SEO/manutenzione sito**: dipendono da interruttori NaBoat; vanno attivati a
  prodotto pronto.
- **Nuovi campi tipo/modello**: inseriti in creazione/modifica barca e nel catalogo
  pubblico, ma non ancora in tutte le viste (es. `/admin/barche`, riepiloghi/contratti
  noleggio, PDF ormeggio).

---

## 5. Problemi conosciuti

- **Riavvia `npm run dev` dopo una migrazione Prisma**: il client Prisma in memoria
  resta quello vecchio e genera errori tipo «Unknown argument».
- **RLS spenta per scelta**: l'isolamento è applicativo; attivarla solo con i ruoli
  dedicati e test su copia (`DEPLOY.md` §8, `scripts/verifica-rls.mjs`).
- **Segreti vuoti in locale** (Stripe/SMTP/Turnstile/S3): email e pagamenti non
  avvengono; i messaggi finiscono nei log. Non è un bug.
- **Warning ESLint storici** (uso di `any`, dipendenze degli hook) in alcune pagine
  del portale/ormeggio: 0 errori, non bloccanti.
- **Deduplica proprietari ormeggio** per telefono → email → nome: due persone con lo
  stesso telefono vengono unite. Comportamento voluto (modificabile se serve).
- **Modulo ormeggio e noleggio condividono `Boat`** con il campo `uso`: le pagine
  ormeggio devono sempre chiedere `?uso=custodia` per non mescolare i due mondi.

---

## 6. Decisioni tecniche già prese

- **Importi sempre in centesimi interi** (`*Cent`), mai float.
- **RLS spenta**; isolamento applicativo con `tenantId` su ogni query.
- **Una sola autorità sui backup**: l'orchestratore governato dal pannello; il vecchio
  servizio `backup` del compose è disattivato (`profiles: ["legacy-backup"]`).
- **Node non installato sull'host del VPS**: gli script Node girano nel servizio
  compose `tools`; il crontab richiama solo `scripts/backup-orchestrator.sh`.
- **`healthz` ≠ `readyz`**: niente controlli DB dentro `healthz`.
- **Chiavi Stripe cifrate a riposo**; le API espongono solo il booleano «configurato».
- **Documento firmato immutabile** (snapshot + hash + versione) e link pubblici con
  token casuali con scadenza (`payToken`, `contrattoToken`).
- **Prevenzione doppie assegnazioni/overbooking a livello DB** (vincoli `EXCLUDE`,
  trigger `booking_no_overlap`) + transazioni con advisory lock.
- **Preventivo con snapshot versionato** (`PREVENTIVO_VERSIONE`); precedenza tariffe
  esplicita (`sceglieTariffa`).
- **Separazione moduli**: in ormeggio la barra laterale mostra solo Ormeggio + Gestione;
  si torna al Noleggio solo dal selettore in alto a sinistra (`src/components/Navigazione.tsx`).
- **Tipo barca canonico + modello testuale** (nuovo): `Boat.tipoCodice` (codice in
  `src/lib/barche.ts`) e `Boat.modelloTesto`; `Boat.tipo` resta l'etichetta leggibile.
  Catalogo marchi/modelli **statico** in `src/lib/modelli-barche.ts` (nessuna tabella).
- **Sagome barca laterali** per tipo in `src/components/ormeggio/SagomaBarca.tsx`.

---

## 7. Servizi esterni

- **Stripe** — pagamenti: account della piattaforma (`PLATFORM_STRIPE_*`) e account
  per singola azienda (chiavi cifrate nel DB).
- **SMTP (Aruba)** — email transazionali; in locale non configurato → log.
- **S3 / Aruba Object Storage** — storage immagini e backup offsite; in alternativa
  **FTP** per i backup.
- **Cloudflare** — DNS/proxy verso il VPS; **Caddy** per TLS e reverse proxy.
- **Cloudflare Turnstile** — anti-bot su login/registrazione/richieste/contatti.
- **Open-Meteo** — meteo (gratuito, nessuna chiave), da `Boat.lat`/`Boat.lon`.
- **Google Places** — ricerca luoghi lato server con `GOOGLE_MAPS_API_KEY`; senza chiave usa il geocoding Open-Meteo. Google Maps è usato anche per link esterni.
- **Supabase/Brevo/Vercel** — nessuna integrazione applicativa dedicata individuata; il deploy documentato resta Docker su VPS.

---

## 8. Variabili d'ambiente (solo nomi — nessun valore)

Non inserire valori nei documenti. Elenco per area.

- **Core**: `DATABASE_URL`, `DATABASE_URL_ADMIN`, `REDIS_URL`, `AUTH_SECRET`,
  `APP_URL`, `NODE_ENV`, `RATE_LIMIT_PREFIX`
- **Postgres (compose)**: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- **Sicurezza/accesso**: `REQUIRE_2FA`, `REQUIRE_EMAIL_VERIFY`, `SUPERADMIN_EMAIL`,
  `SUPERADMIN_PASSWORD`, `RLS_ENABLED`, `TURNSTILE_SECRET`,
  `NEXT_PUBLIC_TURNSTILE_SITEKEY`
- **Email**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`,
  `MAIL_FROM`, `CONTATTI_EMAIL`
- **Stripe**: `PLATFORM_STRIPE_SECRET_KEY`, `PLATFORM_STRIPE_WEBHOOK_SECRET`
- **Storage**: `STORAGE_DRIVER`, `UPLOADS_DIR`, `PRIVATE_UPLOADS_DIR`, `S3_ENDPOINT`,
  `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_BASE_URL`,
  `S3_BACKUP_PREFIX`, `NEXT_PUBLIC_API_BASE`
- **Backup/FTP**: `BACKUP_DIR`, `BACKUP_KEEP_DAYS`, `FTP_HOST`, `FTP_PORT`,
  `FTP_USER`, `FTP_PASS`, `FTP_SECURE`, `FTP_CARTELLA`, `PROVA_RIPRISTINO_FILE`,
  `PROVA_RIPRISTINO_GIORNI`, `PROVA_RIPRISTINO_OBBLIGATORIA`
- **Cron/varie**: `CRON_SECRET`, `GOOGLE_MAPS_API_KEY`, `SEED_OWNER_EMAIL`,
  `DEMO_CONFERMA_PRODUZIONE`
- **Build/runtime info**: `BUILD_SHA`, `COMMIT_SHA`, `GIT_SHA`, `VERCEL_GIT_COMMIT_SHA`
- **Test smoke**: `SMOKE_BASE`, `SMOKE_ORM_EMAIL`, `SMOKE_ORM_PASSWORD`

Template senza segreti: `.env.example`, `.env.local.example`. I file reali `.env` /
`.env.local` non vanno committati.

---

## 9. Ultimi test eseguiti e risultato

- **CI** (`.github/workflows/ci.yml`): `npm run lint`, `npm run typecheck`,
  `prisma migrate deploy` su DB vuoto, `npm run build`.
- **Sessione di sviluppo corrente**:
  - `npx tsc --noEmit` → **0 errori**.
  - `npx eslint` sui file toccati → **0 errori** (solo warning storici).
  - Test API manuali con account demo:
    - creazione/modifica barca **noleggio** con `tipoCodice`/`modelloTesto` → OK;
    - creazione **permanenza ormeggio** con tipo/modello → OK;
    - creazione di **due proprietari distinti** con due barche su due posti → OK
      (assegnazioni corrette, entrambi in `/api/v1/ormeggio/proprietari`).
  - Pagine pubbliche `/`, `/noleggia`, `/per-noleggiatori` → **200**.
  - Tutti i dati di test creati sono stati **rimossi** da DB.
- **Smoke completi** (`scripts/smoke-test.mjs`, `scripts/smoke-ormeggio.mjs`):
  eseguiti su database temporaneo: **386 PASS / 0 FAIL** e **38 PASS / 0 FAIL**.
  `verifica-oggi.mjs`: **19 PASS / 0 FAIL**. Evidenza iniziale del collaudo isolato;
  la verifica finale della build di produzione e delle nuove regressioni è riportata
  in `docs/STABILIZZAZIONE.md`.
  Comando unico: `npm run test:isolated`; nessun FLUSHDB sul Redis di sviluppo.
- Stato servizi locale: Docker, Postgres (5434), Redis (6380) e `npm run dev` (3000)
  attivi; `/api/readyz` = `{ ok: true, db: true, redis: true }`.

---

## 10. Modifiche non ancora committate

Branch `main`. Lavoro in corso non committato (feature «tipo e modello barca + sagome»).
Nessun segreto coinvolto.

**Nuovi file**
- `src/lib/barche.ts` — tipi barca, forme, helper (`etichettaTipo`, `codiceDaTesto`).
- `src/lib/modelli-barche.ts` — catalogo marchi/modelli (~91 marchi, ~1133 modelli).
- `src/lib/opzioni-barche.ts` — opzioni pronte per i combobox.
- `src/components/ui/Combo.tsx` — combobox con ricerca e testo libero.
- `src/components/ormeggio/SagomaBarca.tsx` — sagome laterali per tipo.
- `prisma/migrations/20261009091107_boat_tipo_codice_modello/` — migrazione additiva.

**File modificati**
- `prisma/schema.prisma` — `Boat.tipoCodice`, `Boat.modelloTesto`.
- `src/components/Navigazione.tsx` — separazione Noleggio/Ormeggio nella barra laterale.
- `src/lib/marketplace.ts` — filtro/facet per tipo canonico, etichette, modello.
- `src/app/(sito)/noleggia/page.tsx`, `src/app/(sito)/barca/[slug]/page.tsx` — tipo/modello online.
- `src/app/api/v1/boats/route.ts`, `src/app/api/v1/boats/[id]/route.ts` — campi tipo/modello.
- `src/app/api/v1/ormeggio/permanenze/route.ts`, `.../griglia/route.ts` — tipo/modello.
- `src/app/gestionale/(portale)/flotta/nuova/page.tsx`, `.../flotta/[id]/page.tsx` — campi.
- `src/app/gestionale/(portale)/ormeggio/page.tsx` — reset form, tipo/modello, sagome.
- `src/app/gestionale/(portale)/ormeggio/permanenza/[id]/page.tsx` — modifica barca.
- `src/app/gestionale/(portale)/ormeggio/proprietari/page.tsx` — aggiornamento live.

**Azione consigliata**: rivedere il diff, rieseguire gli smoke test e **committare**.

---

## 11. Proposte iniziali (storico; stato corrente nella sezione 12)

1. **Committare** il lavoro in corso (sezione 10) dopo aver rilanciato typecheck,lint,
   smoke test e build.
2. **Rifinire tipi/sagome**: tassonomia completa, eventuale filtro «tipo» anche a testo
   libero nel catalogo pubblico, tipo/modello in `/admin/barche` e nei riepiloghi.
3. **Ormeggio**: progettare la prenotazione self-service del privato (web/app) e la
   disponibilità automatica dei posti, mantenendo il modulo separato dal pubblico.
4. **Impostazioni «morte»**: collegare o rimuovere dal pannello `sogliaPatenteCv`,
   `pianoProvaGiorni`, `pianoProPrezzo*`.
5. **Redesign del modulo Ormeggio** per l'uso da parte del privato (fase successiva).
6. **Valutare l'attivazione di RLS** solo con i ruoli `naboat_app`/`naboat_admin` e
   test su una copia del database.
7. **Test visivi nel browser** e allineamento della documentazione (`AGENTS.md`,
   `MIGRAZIONE-URL.md`, `DEPLOY.md`) se cambiano rotte o regole.


## 12. Stabilizzazione del 9 ottobre

Vedi [STABILIZZAZIONE.md](STABILIZZAZIONE.md) per interventi, collaudo e decisioni aperte.

### Revisione operativa Ormeggio (9 ottobre 2026)

Analisi di marina/campo boe, transito, rimessaggio, cantiere e strutture miste,
ruoli, miglioramenti delle schermate e limiti in
[ORMEGGIO-USABILITA.md](ORMEGGIO-USABILITA.md).

Collaudo finale: **693 PASS, 0 FAIL** (386 generale, 50 API Ormeggio, 19 Oggi,
22 stabilizzazione, 79 separazione, 29 disponibilità, 108 Chrome). Typecheck e
lint senza errori (248 warning preesistenti); confini e build riusciti.
Database temporaneo rimosso. Localhost risponde HTTP 200; otto verifiche browser
in sola lettura sullo sviluppo riuscite, senza errori di pagina o idratazione.
Il collegamento al sito è rimosso nel modulo Ormeggio; i tenant di solo Ormeggio
sono esclusi da profili pubblici, catalogo e sitemap mediante un filtro comune.
Le aziende miste conservano il noleggio pubblico. I contratti con token restano
disponibili. Nessuna modifica allo schema o alle regole degli importi.
Le porte Docker locali sono ora limitate a 127.0.0.1. Il contesto Docker esclude
file di ambiente reali, archivi privati e copie dati. Gli smoke diretti rifiutano
database ordinari: usare `npm run test:isolated`, che crea un database vuoto,
una copia temporanea del codice, upload separati e chiavi rate-limit dedicate.
Gli snapshot firmati restano immutabili; tipo/modello sono aggiunti solo ai nuovi
documenti. La fee NaBoat è contabilizzata ma non trasferita automaticamente.
`Extra.prezzo` resta un campo legacy in euro Float: la migrazione in centesimi e
il calcolo per unità sono attività separate da pianificare prima di cambiare i prezzi.

### Quadro posti: trascinamento e adattamento (9 ottobre 2026)

`GrigliaPosti` gestisce il trascinamento sulla data di oggi attraverso la stessa
API Sposta, con anteprima, destinazione evidenziata, annullamento e ritorno sui
conflitti. Celle uniformi adattate allo spazio disponibile, con piè di cella
riservato ai nomi. Griglia senza scorrimento orizzontale; dettagli ingranditi
al passaggio del cursore o al focus su ogni barca. Per le altre date si usa
Sposta con decorrenza esplicita. La griglia di oggi legge la posizione corrente
per evitare doppie rappresentazioni dopo trasferimenti; le altre date mantengono
la ricostruzione giornaliera. La riduzione dell’area è ora consentita anche con assegnazioni/storico:
vedi la revisione Rimozione delle griglie in fondo al documento. **518 PASS, 0 FAIL**, inclusi 53 controlli Chrome; typecheck,
lint e build riusciti (254 warning storici). Dettagli in ORMEGGIO-USABILITA.md.

### Configura posti sull’area selezionata (9 ottobre 2026)

Dal quadro, Configura posti apre nome/righe/colonne dell’area corrente con
salvataggio esplicito, mantenendo i clic per bloccare/riabilitare singoli posti.
Il cambio area aggiorna il modulo. La nuova area resta un dettaglio secondario.
Il pulsante Aggiorna è rimosso: le letture automatiche dopo modifiche, al focus
e ogni 10 secondi coprono il suo uso ordinario; Riprova compare soltanto in caso
di errore di caricamento. Durante la configurazione le letture periodiche sono
sospese per preservare il modulo; all’uscita si rilegge subito il quadro.
Collaudo: **527 PASS, 0 FAIL**, inclusi 62 Chrome. Typecheck, lint e build riusciti
(254 warning storici). Nessuna modifica allo schema o ai permessi server.

### Rimozione delle griglie anche con storico (9 ottobre 2026)

Il proprietario ha richiesto di consentire riduzione/eliminazione anche con
assegnazioni o storico: il precedente blocco 409 è rimosso. Le dimensioni attive
filtrano i posti mostrati in griglia/configurazione/selettori; i posti fuori
limite ancora referenziati restano a supporto della storia. DELETE dell’area
imposta `Area.archiviata`, mantenendo soste, incassi, contratti e PDF. Migrazione
`20261009123402_ormeggio_aree_rimosse_storico` applicata al DB locale; client Prisma
rigenerato e server locale riavviato. Le aree esistenti partono tutte non archiviate.
Il quadro mostra le assegnazioni ai posti rimossi in «Barche fuori griglia» per
la data selezionata, con accesso alla scheda e trasferimento diretto. I posti
rimossi rifiutano nuove assegnazioni. Lock sull’area serializzano modifiche della
griglia e assegnazioni concorrenti. Le griglie reali non vengono rimosse dai test:
il collaudo usa database e tenant temporanei.

Esito finale: **546 PASS, 0 FAIL** (386 generale, 47 Ormeggio, 19 Oggi, 22
stabilizzazione, 72 Chrome). Typecheck e lint senza errori (254 warning storici),
build riuscita. Verificati riduzione con assegnazioni, espansione, eliminazione
con contratto firmato, conservazione incassi/conti/PDF e riassegnazione effettiva.

### Leggibilità del quadro e rimessaggio rinviato (revisione intermedia, 9 ottobre 2026)

Superato il rapporto fisso 80/20 delle celle: nomi a capo, senza ellissi, da
12–14px; righe occupate dimensionate secondo il testo, con spazio ceduto dalle
righe vuote. Nessuno scorrimento orizzontale del quadro. Sotto 80px per cella,
la panoramica resta completa e schede sotto la mappa mostrano sempre nomi e
coordinate leggibili, collegate alla stessa scheda della barca. Le righe possono
crescere in altezza quando necessario: non rimpicciolire i nomi per contenere
la pagina in un solo schermo.
Gli stati sono automatici e utili: in_sosta rinominato «Al posto», bloccata
rinominato «Non disponibile» (manutenzione/non_disponibile); quest’ultimo compare
in legenda solo quando presente nell’area, distinto dai posti non utilizzabili.
Rimessaggio rinviato per richiesta esplicita: rimosso da nuova sosta e presentazione
in registrazione, API nuova permanenza accetta solo ormeggio_custodia. Conservati
enum, lettura e documenti storici dei dati preesistenti; nessuna migrazione.
**551 PASS, 0 FAIL**, inclusi 50 API Ormeggio e 74 Chrome. Typecheck, lint e build
riusciti (254 warning storici). Dettagli in ORMEGGIO-USABILITA.md.


### Revisione corrente: proprietari, economia e catalogo (9 ottobre 2026)

Su richiesta successiva del titolare, ripristinate celle tutte uguali e anteprima
su ogni barca al mouse/focus; rimosse altezze variabili e schede duplicate sotto
la griglia densa. Trascinamento e adattamento senza scorrimento orizzontale restano.

Proprietari: nome cliccabile, dialogo di modifica nome/telefono/email/note,
validazione e conflitto recapiti 409. Eliminazione confermata: archivia anagrafica
e barche in custodia, chiude soste, libera assegnazioni correnti e future;
barche eliminate escluse dagli elenchi operativi. Documenti, storico e incassi
non vengono cancellati: conto ancora accessibile in Economia, marcato storico.
Nessuna conversione di incassi né rimborso automatico. Le attività sospese delle
barche eliminate non possono essere completate; restano rettifiche/storni espliciti.

Economia: nomi cliccabili aprono riepilogo e soste del proprietario; collegamenti
diretti a Conto per gestire addebiti, incassi, storni e PDF, con permessi server.

58 servizi predefiniti, ricercabili e modificabili per nome/prezzo/unità; CRUD
libero per voci personalizzate. Prezzi da definire (null). Inizializzazione
POST autenticata, transazionale e una sola volta per tenant; non reinserisce
servizi cancellati. Modificare il catalogo non riscrive le attività pregresse.
Marca/modello rimossi dai flussi e nuovi documenti Ormeggio; nome e tipologia
modificabili. Noleggio e snapshot firmati preesistenti conservati.

Migrazione `20261009144649_ormeggio_proprietari_catalogo` applicata al DB locale,
Prisma rigenerato, sviluppo riavviato. Dettagli in `docs/ORMEGGIO-USABILITA.md`.


Collaudo finale della revisione corrente: **571 PASS, 0 FAIL** (386 generale,
50 API Ormeggio, 19 Oggi, 22 stabilizzazione, 94 Chrome). Typecheck e lint senza
errori (248 warning presenti), build di produzione riuscita. Verificati mouse
reale, celle uniformi e piè di cella senza taglio verticale, trascinamento,
modifica recapiti e duplicati, accesso ai conti dal nome, modifica prezzi/unità,
inizializzazione idempotente e prezzi riservati, isolamento tra tenant,
eliminazione con barca futura, conservazione di contratto e incasso reali,
sospensione delle attività e conto storico ancora gestibile. Schermate desktop
e telefono controllate. Test esclusivamente su database temporanei.


### Prima separazione interna dei prodotti (9 ottobre 2026)

Avviata la separazione mantenendo una sola applicazione e lo schema esistente.
Estratti `src/modules/piattaforma/accesso-azienda.ts`,
`src/modules/noleggio/disponibilita.ts`, `src/modules/ormeggio/accesso.ts`,
`regole.ts` e `servizi.ts`. Vecchi percorsi in `src/lib` conservati come esportazioni
di compatibilità; 29 chiamanti aggiornati. Implementazioni preservate, con confronto
meccanico prima/dopo. ESLint impedisce dipendenze dirette tra i prodotti nei
percorsi coperti e dipendenze server nelle regole pure/catalogo Ormeggio.

Copia locale del codice prima dell’intervento: 445 file con manifest e hash,
fuori dal repository, senza segreti o dati runtime. Non è un backup del database.
Mappa delle responsabilità, limiti, procedura di ritorno e prossimi incrementi in
[SEPARAZIONE-MODULI.md](SEPARAZIONE-MODULI.md). Prossimo incremento consigliato:
servizio barche in custodia dedicato e verifica delle abilitazioni di prodotto
prima di applicare nuovi blocchi alle API legacy.

Collaudo dopo la separazione: **571 PASS, 0 FAIL** (386 generale, 50 API Ormeggio,
19 Oggi, 22 stabilizzazione, 94 Chrome), su database temporanei. Typecheck e lint
senza errori (248 warning preesistenti), build di produzione riuscita. Sei casi
aggiuntivi verificano i vincoli sugli import (quattro dipendenze vietate respinte,
due consentite). Nessuna migrazione o modifica al database operativo.


### Completamento separazione interna, punti 1–7 (9 ottobre 2026)

Estratte le operazioni server e le schermate dei due prodotti nei rispettivi moduli,
comprese pagine pubbliche e calendario del Noleggio. API Ormeggio proprie per le
barche in custodia; vecchi indirizzi generali conservati come adattatori compatibili.
Guardie server coerenti per aziende singole/miste/legacy, con regola già usata dal
menu; pagine controllate prima del montaggio e navigazione definita per prodotto.

Snapshot dei contratti distinti dai servizi comuni di firma/impronta; checkout
prenotazioni nel Noleggio, provider/configurazione/webhook comuni. Registri incassi
separati per permanenza; conti e documenti storici preservati. Nessun cambiamento a
fee, cifrature, Stripe, abbonamenti, DNS, hosting, cookie, schema o dati operativi.
Impostazioni interne nel contesto Ormeggio, editor pubblico conservato nel Noleggio.

`npm run check:boundaries` verifica dipendenze statiche anche transitive, import
dagli adattatori, chiamate esplicite ad API estranee e guardie nelle operazioni
private; attivo in CI e nel collaudo isolato. Nuova suite API
`scripts/verifica-separazione.mjs` e regressioni Chrome per aziende miste,
modifica barca, griglia e impostazioni. Copia prima dell’intervento: 451 file con
manifest verificato in `/private/tmp/naboat-separazione-completa-g7j6rjk2`,
senza segreti o dati runtime. Mappa e ripristino in SEPARAZIONE-MODULI.md.

Collaudo finale corrente: **659 PASS, 0 FAIL** (386 generale, 50 API Ormeggio,
19 Oggi, 22 stabilizzazione, 79 separazione prodotti, 103 Chrome). Typecheck e lint
senza errori (248 warning preesistenti), build di produzione riuscita. Confini:
165 file di modulo, 472 file del grafo, 113 operazioni private controllate,
quattro regressioni del verificatore superate. Ambienti temporanei eliminati;
schema Prisma identico al checkpoint e gestionale locale raggiungibile.
Il prossimo lavoro funzionale è sull’Ormeggio interno. Le precedenti proposte
di self-service pubblico/rimessaggio restano rinviate secondo la decisione del
titolare. Applicazioni, deployment e database indipendenti restano fasi future.

### Ripristino localhost e idratazione utente (9 ottobre 2026)

Dopo la conversione delle pagine client in adattatori server, Fast Refresh del
processo di sviluppo già avviato conservava la vecchia classificazione e segnalava
`next/headers` tramite `accesso-pagine → identita → session`. Risolto riavviando
`npm run dev`; dopo cambiamenti analoghi riavviare sempre lo sviluppo.

Trovato anche un errore di idratazione di Economia: il layout caricava la cache
utente prima dell’idratazione della pagina. `useUtente` ora inizializza lo stato
a `null` su server e browser, leggendo la cache nell’effetto di montaggio.
La richiesta condivisa e i controlli di sessione restano invariati.

Otto verifiche browser sul localhost reale riuscite, incluse le sette schermate
principali e la navigazione Quadro → Economia; richieste di scrittura intercettate,
nessuna modifica ai dati. Regressione aggiunta al collaudo isolato: **660 PASS,
0 FAIL**, inclusi 104 Chrome; build, typecheck, lint e confini riusciti
(248 warning preesistenti). Database temporaneo rimosso, sviluppo lasciato attivo.

### Correzione disponibilità del quadro posti (9 ottobre 2026)

Individuato con letture del database locale il falso «posto occupato» su posti
liberati durante la giornata: il quadro interrogava l’istante attuale, la nuova
sosta con data odierna iniziava invece da mezzanotte. La sola data di oggi ora
avvia la sosta al salvataggio; gli orari ISO espliciti restano utilizzabili per
lo storico. Nessuna modifica ai dati operativi o allo schema.

Regole temporali condivise in `src/modules/ormeggio/periodi.ts`: sovrapposizioni
con fine esclusa come i vincoli EXCLUDE del database, periodo senza fine realmente
illimitato, giorno Europe/Rome comune a quadro ed elenco, validazione rigorosa
delle date. Creazione e trasferimento indicano il periodo del conflitto reale.
Modificare la fine prima dell’ultimo trasferimento restituisce 422, con rollback
anche dell’eventuale rettifica economica. Sul 409 il quadro si aggiorna lasciando
aperto il modulo compilato. Aiuto contestuale su inizio oggi e soste senza fine.

Nuova suite isolata `scripts/verifica-disponibilita-ormeggio.mjs` e regressioni
browser per riutilizzo dopo chiusura e trasferimento. Dettagli funzionali in
[ORMEGGIO-USABILITA.md](ORMEGGIO-USABILITA.md).

### Accesso diretto alle attività Ormeggio (9 ottobre 2026)

Completata la pagina già collegata alla voce «Attività» nel menu Ormeggio:
selettore cliente (nome/telefono/email), barca del cliente e sosta. Propone la
sosta corrente prima di quelle future; il periodo resta modificabile. I comandi
aprono la stessa scheda Attività del quadro posti, oppure direttamente il suo
modulo Nuova attività. Collegamento di ritorno e ricerca dei lavori per cliente.

Nuovo GET `/api/v1/ormeggio/proprietari/[id]`, con guardia Ormeggio e tenant,
barche operative in custodia e sole informazioni operative delle soste, senza
importi. Clienti eliminati e barche archiviate esclusi. Cambiare cliente azzera
barca e sosta; richieste obsolete annullate. Nessuna creazione implicita di soste,
nessuna migrazione o modifica dei flussi economici. Documentazione funzionale in
ORMEGGIO-USABILITA.md; suite `scripts/verifica-accesso-attivita.mjs` e regressioni
Chrome integrate nel collaudo isolato.

Collaudo finale: **724 PASS, 0 FAIL** (386 generale, 50 API Ormeggio, 19 Oggi,
22 stabilizzazione, 79 separazione, 29 disponibilità, 17 accesso attività,
122 Chrome). Typecheck e lint senza errori (248 warning preesistenti), build
riuscita; confini: 167 file di modulo, 474 file del grafo e 114 operazioni private,
quattro regressioni del verificatore superate. Schermate desktop e telefono
controllate; otto verifiche browser di localhost in sola lettura riuscite.
Database temporaneo eliminato, nessuna scrittura sui dati operativi.

### Catalogo servizi condiviso nella pagina Attività (9 ottobre 2026)

Aggiunto il menu a tendina dei servizi offerti con creazione e modifica di nome,
prezzo e unità direttamente da Attività. Estratto `CatalogoServizi`, usato anche
da Configurazione, preservando ricerca ed eliminazione. Nuovo hook condiviso
`useCatalogoServizi` anche nella scheda sosta: inizializzazione idempotente,
lettura, aggiornamenti nelle pagine aperte ed errori con Riprova.

Stesse API e stesso catalogo persistente; nessuna migrazione o nuova regola
economica. Prezzi con due decimali al massimo, memorizzati in centesimi interi;
null e zero distinti. Aggiornamenti del catalogo senza cambiare le bozze già in
compilazione; nuova selezione con valori attuali. Attività e addebiti precedenti
mantengono gli snapshot. Permesso importi conservato, anche nelle modifiche dei
nomi da parte di un addetto. Regressioni Chrome per creazione, modifica,
sincronizzazione tra pagine, storico, focus, prezzi non validi e telefono.

Collaudo finale: **739 PASS, 0 FAIL**, inclusi 137 Chrome (15 nuove verifiche del
catalogo). Typecheck, lint e build riusciti; 248 warning preesistenti. Confini:
169 file di modulo, 476 file del grafo e 114 operazioni private controllate,
quattro regressioni del verificatore superate. Schermata telefono controllata;
otto prove browser di localhost in sola lettura riuscite. Database temporaneo
eliminato, nessuna scrittura di collaudo sui dati operativi.

### Gestione rapida ed eliminazione del catalogo (9 ottobre 2026)

Catalogo in Attività con ricerca immediata per nome/unità, tendina filtrata,
eliminazione diretta e elenco apribile con Modifica/Elimina su ogni riga.
Selezione azzerata quando cambia la ricerca; contatori e viste aggiornati dopo
l’esito. Conferma con nome della voce, annullamento senza modifiche, comandi
disabilitati durante l’operazione. Gestito anche il 404 se un collega ha già
eliminato il servizio. Modificare una voce conserva la bozza di nuovo servizio.

DELETE `/api/v1/ormeggio/servizi/[id]` ora usa `deleteMany` con id e tenant in
un’unica operazione, evitando la corsa tra lettura ed eliminazione. Guardie e
permessi invariati. Nessuna migrazione; lavori e addebiti già salvati preservati.
Regressioni API per isolamento e doppia eliminazione simultanea, Chrome per
ricerca, conferma/annullamento, rimozione da tendina/elenco/scheda, contatori,
storico contabilizzato e telefono.

Collaudo finale: **753 PASS, 0 FAIL**, inclusi 149 Chrome e 19 accesso attività.
Typecheck, lint, confini e build riusciti; 248 warning preesistenti. Dodici nuove
verifiche browser e due API per eliminazione e gestione rapida. Schermata telefono
controllata, otto prove browser di localhost in sola lettura riuscite. Database
temporaneo eliminato; nessuna cancellazione di servizi reali durante il collaudo.

### Ricerca e selezione servizi in un unico campo (9 ottobre 2026)

In Attività eliminata la doppia interfaccia ricerca/menu del catalogo:
un solo campo mostra sotto i suggerimenti che iniziano con il testo digitato,
ignorando maiuscole e accenti; campo vuoto con focus mostra tutte le voci.
Modifica ed Elimina sono disponibili su ogni suggerimento, oltre ai comandi
della voce selezionata e Nuovo servizio. Freccia giù, Invio, Esc e Tab supportati;
focus mantenuto dopo la scelta, suggerimenti chiusi all’uscita, layout adattivo.

Stesso componente `CatalogoServizi`, stesse API, catalogo condiviso e protezioni
su storico/importi. Nessuna migrazione. Configurazione conserva la ricerca
per nome e unità. Regressioni Chrome aggiornate per il campo unico, filtro per
iniziali, azioni dirette, tastiera e telefono.

Collaudo finale: **760 PASS, 0 FAIL** (386 generale, 50 API Ormeggio, 19 Oggi,
22 stabilizzazione, 79 separazione, 29 disponibilità, 19 accesso attività,
156 Chrome). Typecheck, lint, confini e build riusciti; 248 warning preesistenti.
Schermate desktop e telefono controllate, undici verifiche browser di localhost
riuscite con tutte le scritture intercettate. Database temporaneo rimosso,
nessuna modifica di collaudo ai dati reali.

### Pannello posto con attività in evidenza (10 ottobre 2026)

Estratto `SchedaPosto` dal quadro: intestazione nei colori NaBoat, nomi completi,
posto/area, informazioni separate e azioni per attività, conto, documenti e
contatti; note espandibili e trasferimento preservato. Stesso componente sul
telefono. Riquadro giallo prima delle sezioni con le attività aperte, date e
stati; ogni lavoro apre la relativa riga evidenziata nella scheda completa.

GET griglia ora restituisce `attivitaAperte` (id/tipo/stato/dataPrevista/addetto.nome),
derivate dallo stesso insieme usato per `attivitaDaFare` e colore della barca.
Nessun prezzo aggiunto. Avviso disponibile prima del GET dettagli; completamenti
aggiornano avviso e griglia attraverso il flusso di aggiornamento esistente.
GET dettagli annullato al cambio selezione; rendering vincolato all’id corrente,
errori con Riprova nel pannello. La navigazione al lavoro scorre alla riga una
sola volta, rispettando la preferenza di movimento ridotto. Nessuna migrazione.

Alla selezione desktop il pannello viene portato in vista se fuori schermo,
senza ripetere lo scorrimento agli aggiornamenti periodici. Regressioni browser
aggiunte per avviso immediato, date, collegamento alla riga evidenziata,
errori/Riprova, cambio barca, telefono, permessi e completamento dei lavori.

Collaudo finale: **777 PASS, 0 FAIL** (386 generale, 50 API Ormeggio, 19 Oggi,
22 stabilizzazione, 79 separazione, 29 disponibilità, 19 accesso attività,
173 Chrome). Typecheck e lint senza errori (244 warning storici), confini
riusciti (170 file di modulo, 477 nel grafo, 114 operazioni private), build
di produzione riuscita. Schermate desktop e telefono controllate; quattro
verifiche browser di localhost in sola lettura riuscite. Database temporaneo
rimosso, nessuna modifica di collaudo ai dati reali.

### Tariffa mensile della sosta in Economia (10 ottobre 2026)

Nuovo componente `TariffaMensile` in Economia, sotto il riepilogo: campo costo
per barca in euro/mese e salvataggio nella voce mensile del catalogo condiviso.
Riusa `useCatalogoServizi` e le API servizi esistenti, con gli stessi permessi,
aggiornamenti e isolamento per azienda. Riconosce anche il servizio rinominato
con unità «mese»; selettore se ci sono più voci mensili, creazione esplicita di
«Ormeggio mensile» al salvataggio se non esiste una voce mensile.

Prezzi validati con due decimali e memorizzati in centesimi interi; zero distinto
da non configurato. Bozze mantenute agli aggiornamenti periodici. La tariffa
è proposta selezionando il servizio nelle nuove attività; non avvia addebiti
ricorrenti e non cambia corrispettivi o addebiti esistenti. Nessuna migrazione
né modifica delle regole economiche o delle API. Regressioni browser su
salvataggio, persistenza, collegamento alle attività, prezzi, rinomina,
aggiornamenti, telefono e permessi.

Collaudo finale: **788 PASS, 0 FAIL** (386 generale, 50 API Ormeggio, 19 Oggi,
22 stabilizzazione, 79 separazione, 29 disponibilità, 19 accesso attività,
184 Chrome). Typecheck e lint senza errori (244 warning storici), confini
riusciti (171 file di modulo, 478 nel grafo, 114 operazioni private), build
di produzione riuscita. Schermate desktop e telefono controllate. Database
temporaneo rimosso; nessuna tariffa reale impostata durante il collaudo.

### Tariffe giornaliere/mensili e corrispettivo modificabile (10 ottobre 2026)

Sostituito `TariffaMensile` con `TariffeSosta`: due barre con sola etichetta e
importo, salvataggio su blur/Invio, stato accessibile e conferma tramite icona.
Logica condivisa in `tariffe.ts` per scelta del servizio e conversione rigorosa
euro/centesimi. Il catalogo rimane la fonte delle tariffe. La giornaliera non
riutilizza servizi estranei con unità giorno (parcheggio, guardiania, ecc.).

Nuova sosta: corrispettivo precompilato con la tariffa mensile, proposta congelata
alla prima disponibilità e valore manuale sempre preservato. La registrazione
attende il catalogo quando non c’è ancora una scelta manuale. Nuova compilazione
pulita; nessuna proposta economica agli addetti senza permesso importi.

Nuovo `CorrispettivoSosta` nella scheda completa: modifica prezzo tramite il PATCH
esistente con `rettifica: true`, aggiorna conto e viste, non modifica il listino.
Lock della permanenza in transazione prima del calcolo della rettifica per
evitare doppie contabilizzazioni concorrenti. Il PATCH scrive la fine prevista
solo quando richiesta, evitando che una modifica del prezzo riscriva date lette
precedentemente. Documenti già generati conservati; revisione dei non firmati
tramite il comando Contratto esistente. Nessuna migrazione, automatismo ricorrente
o calcolo proporzionale alla durata introdotto. Regressioni su concorrenza,
precompilazione, personalizzazione, nuova compilazione, scheda, conto e permessi.

Collaudo finale: **799 PASS, 0 FAIL** (386 generale, 50 API Ormeggio, 19 Oggi,
22 stabilizzazione, 79 separazione, 32 disponibilità, 19 accesso attività,
192 Chrome). Typecheck e lint senza errori (244 warning storici), confini
riusciti (173 file di modulo, 480 nel grafo, 114 operazioni private), build
di produzione riuscita. Gestione esplicita di Invio verificata dopo aver rilevato
che il submit implicito non partiva in modo affidabile. Schermate desktop e
telefono controllate; localhost HTTP 200. Database temporaneo rimosso,
nessuna tariffa o sosta reale modificata durante il collaudo.

### Preventivo della sosta dalle date (10 ottobre 2026)

Il corrispettivo iniziale non propone più una mensilità fissa: `preventivoSosta`
in `src/modules/ormeggio/tariffe.ts` calcola mesi di calendario completi più
giornate residue, con giorno iniziale e finale inclusi. Esempi: 1–10 gennaio =
10 giornate; 1–31 gennaio = una mensilità; 1 gennaio–1 febbraio = una mensilità
più una giornata; 15 gennaio–14 febbraio = una mensilità. Gli anniversari
mensili restano ancorati al giorno iniziale, adattato all’ultimo giorno quando
il mese è più corto. Aritmetica sulle date civili UTC, indipendente dai cambi
di ora legale, importi sempre in centesimi interi.

Il modulo mostra le date prima del prezzo e un riepilogo del calcolo. Finché
non sono scelte entrambe le date non propone un importo. Il prezzo automatico
segue le date; una modifica manuale resta preservata anche cambiando periodo
o durante gli aggiornamenti. «Usa prezzo suggerito» ripristina l’automatismo.
Tariffe mancanti, date non valide e importi oltre il limite hanno messaggi
espliciti; è possibile inserire un prezzo concordato. Senza fine prevista
resta possibile registrare una sosta indeterminata con prezzo manuale o nullo.

La registrazione da Quadro posti converte le date in istanti di Roma: inizio
a mezzanotte, salvo oggi che parte dal salvataggio; fine all’ultimo istante
del giorno scelto. Ammesse soste di una sola giornata. Restano invariati i
vincoli di sovrapposizione, le API con istanti espliciti, le soste esistenti e
la rettifica del prezzo dalla scheda completa. Corretto anche l’adattamento
del modulo alla larghezza disponibile per evitare campi tagliati. Nessuna
migrazione o contabilizzazione ricorrente.

Collaudo finale: **837 PASS, 0 FAIL** (386 generale, 50 API Ormeggio, 19 Oggi,
22 stabilizzazione, 79 separazione, 58 disponibilità/preventivi, 19 accesso
attività, 204 Chrome). Typecheck e lint senza errori (244 warning storici),
confini riusciti (173 file di modulo, 480 nel grafo, 114 operazioni private),
build di produzione riuscita. Verificati periodi inclusivi, mesi di calendario,
bisestili, ora legale, tariffe mancanti/gratuite, prezzo manuale, ripristino del
suggerimento, conto e occupazione dell’ultimo giorno. Controllate le schermate
desktop/telefono e rafforzati i controlli sull’effettiva larghezza del modulo.
Database temporaneo rimosso; localhost ripristinato sulla porta 3000.

### Destinatario WhatsApp nell’Ormeggio (10 ottobre 2026)

I contatti del pannello Quadro posti e della scheda completa ora usano
`telefonoWhatsApp` da `src/lib/telefono.ts`. Prima i due comandi eliminavano
semplicemente i caratteri non numerici: un cellulare italiano salvato senza
prefisso poteva essere interpretato da WhatsApp come numero estero. La
normalizzazione condivisa aggiunge 39 ai numeri locali, riconosce +39/0039
e prefisso italiano già presente, mantiene prefissi esteri espliciti e zero
iniziale dei fissi. Il dato salvato resta invariato; la correzione vale anche
per i proprietari già inseriti, senza migrazioni.

Numeri non validi non producono link WhatsApp: nel pannello il comando è
disabilitato con indicazione di verifica, nella scheda compare un errore
prima dell’apertura del messaggio. Regressioni browser su entrambi i comandi,
formati italiani/esteri, telefono, numeri assenti/non validi e conservazione
del messaggio per proprietario e barca. Le prove intercettano l’apertura
della chat e non contattano servizi esterni né destinatari reali.

Collaudo finale: **862 PASS, 0 FAIL** (386 generale, 50 API Ormeggio, 19 Oggi,
22 stabilizzazione, 79 separazione, 58 disponibilità/preventivi, 19 accesso
attività, 229 Chrome). Le 25 nuove verifiche coprono destinatari da quadro e
scheda, formati diversi, prefissi espliciti, numero locale che inizia con 39,
fissi, telefono e gestione dei recapiti mancanti/non validi. Typecheck e lint
senza errori (244 warning storici), confini e build riusciti. Ambiente
temporaneo rimosso; localhost HTTP 200. Nessun recapito operativo modificato.

### CI GitHub: file upload escluso dalle regole Git (10 ottobre 2026)

La CI del commit `1a626f8` si è fermata al typecheck con TS2307: mancava
`src/modules/piattaforma/server/uploads/operazioni.ts`, importato dall’adattatore
`src/app/api/v1/uploads/route.ts`. Il file esisteva in locale ma la regola
generica `uploads` di `.gitignore` escludeva anche la directory del codice.
Installazione, migrazioni e lint erano riusciti; build e collaudo remoto
non erano stati eseguiti perché successivi al typecheck.

Regole degli archivi immagini limitate ai percorsi effettivi `/public/uploads/`,
`/uploads/` e `/uploads-privati/`; il modulo server upload viene incluso nel
repository. Nessuna modifica della logica di caricamento o delle API.
Il collaudo isolato ora copia solo file tracciati o nuovi non ignorati da Git,
così un modulo disponibile solo in locale perché ignorato non può mascherare
un errore di compilazione del checkout remoto. Restano esclusi gli upload
operativi e rimangono temporanei codice, database e dipendenze del collaudo.

Verifiche locali della correzione: typecheck e lint senza errori (244 warning
storici), confini rispettati, regole Git verificate sul modulo e sui tre
archivi di immagini. Build e collaudo completo riusciti: **862 PASS, 0 FAIL**,
inclusi 229 Chrome, con copia del codice filtrata secondo Git. Ambiente
temporaneo rimosso. Nessun altro file sorgente risulta ignorato in `src`.

La prima nuova esecuzione GitHub (`00058b0`) supera typecheck, lint, confini e
build, ma rileva una differenza nel test storico dei trasferimenti: lo smoke
costruiva la mezzanotte nel fuso del processo. Su GitHub (UTC) equivaleva alle
02:00 italiane e la vista storica giornaliera mostrava correttamente entrambi i
posti occupati in momenti diversi. `smoke-ormeggio.mjs` usa ora le funzioni
condivise `giornoDi`, `aggiungiGiorni` e `inizioGiorno` per le date di prova,
senza dipendere dal fuso della macchina e senza modificare la logica applicativa.
Verifica successiva con `TZ=UTC npm run test:isolated`: build riuscita, 633 PASS
e 0 FAIL, incluso lo spostamento storico; database e codice temporanei rimossi.
Typecheck, lint (0 errori, 244 warning storici) e confini superati. Conversioni
di prova controllate anche con `Europe/Rome` e `America/New_York`, inclusi i
giorni di cambio dell'ora legale e solare.

### Contatori interattivi del Quadro posti (10 ottobre 2026)

Rimossa la casella «Barche non disponibili» dal riepilogo, che ora contiene
cinque voci. Occupati, Liberi e Non utilizzabili evidenziano i
posti corrispondenti: rilievo leggero al passaggio del mouse o al focus da
tastiera, bordo/ombra più marcati dopo il clic. Un secondo clic annulla la
selezione; il passaggio su un'altra voce conserva la selezione già attiva.
I posti restano visibili e le coordinate fisse. La selezione segue i dati
della data/area corrente, vale anche nell'Elenco e viene sospesa visivamente
durante il trascinamento. «Da sistemare» mantiene il dialogo esistente.

Barra con data, area e filtri uniformata nei colori, bordi e arrotondamenti.
Dimensioni prima/dopo misurate nel browser locale: 1157 × 58 px con viewport
1440 px, 358 × 147 px con viewport 390 px, senza overflow orizzontale.
Nessuna modifica a database, API, permessi o dati operativi. Aggiunte prove
browser per hover, clic, annullamento, selezione/anteprima contemporanee,
Elenco, tastiera, movimento ridotto e telefono.

Collaudo finale: **881 PASS, 0 FAIL** (633 API/regressioni e 248 Chrome),
build di produzione riuscita. Typecheck e lint senza errori (244 warning
storici), confini rispettati. Corrette simulazione di Invio e attesa del
rendering nel nuovo test da tastiera. Schermate desktop/telefono controllate;
le quattro interazioni verificate anche su localhost in sola lettura.
Database e codice temporanei rimossi.

Estensione successiva: lo stesso rilievo leggero si applica alla singola
barca sotto il cursore nella griglia, riutilizzando l'anteprima già esistente
anche per il focus. I posti vuoti, compresi quelli bloccati, non acquisiscono
rilievo al passaggio. La selezione più marcata dei contatori ha la precedenza;
durante il trascinamento resta sospeso il rilievo. Typecheck, lint (244 warning
storici, nessun errore) e confini superati. Quattro controlli browser locali
in sola lettura riusciti: barca, posto vuoto, posto vuoto bloccato e precedenza
della selezione; anteprima conservata e dimensioni della barra invariate.

Su richiesta successiva, «Posti totali» torna solo informativo: nessun
comando, focus, ombra o evidenziazione dei posti al passaggio/clic. Le tre
categorie utili restano interattive. Aggiornati i controlli browser esistenti
alla casella statica. Typecheck, lint (244 warning storici, nessun errore) e
confini superati; verificati in sola lettura hover/clic sul totale e selezione
di Occupati. Dimensioni della barra confermate invariate desktop/telefono.

### Servizi personalizzati in cima al catalogo (10 ottobre 2026)

`ServizioCatalogo.predefinito` distingue l'origine della voce, conservata anche
dopo una rinomina. Le creazioni manuali restano `false`; l'inizializzazione
dei servizi pronti scrive `true`. Il GET condiviso ordina prima i servizi
personalizzati dal più recente, poi i predefiniti alfabeticamente. Catalogo
in Configurazione, tendina Attività e suggerimenti nella scheda barca usano
lo stesso ordine, anche dopo modifiche e aggiornamenti automatici.

Migrazione `20261010120000_ormeggio_servizi_personalizzati` applicata in locale;
client Prisma rigenerato e server riavviato. Recupera l'origine dei lotti
storici tramite tenant/data di creazione e audit di inizializzazione, senza
dedurla dai nomi. Riconosce il lotto ancora presente anche con voci rinominate
o eliminate; in assenza di un lotto identificabile di almeno due voci lascia
l'origine personalizzata. Sul catalogo locale completo: 2 voci personalizzate
prima di 57 predefinite, verificate in sola lettura su tutte e tre le schermate.

La scelta automatica delle tariffe di sosta resta alfabetica, indipendente
dall'ordine di visualizzazione. Nessuna variazione agli importi salvati, alle
attività già registrate o ai permessi. Nuove regressioni su ordine di creazione,
rinomina, omonimi, inizializzazione idempotente, isolamento, addetti senza
importi, recupero storico e disponibilità delle stesse voci nelle schermate.

Collaudo finale: **897 PASS, 0 FAIL** (647 API/regressioni e 250 Chrome), build
di produzione riuscita. Typecheck e lint senza errori (244 warning storici),
confini rispettati. Database e codice temporanei rimossi; localhost pronto
con DB e Redis raggiungibili. Test esistenti del riepilogo adeguati al totale
solo informativo richiesto durante la stessa sessione.

### Servizi NaBoat per Ormeggio (10 ottobre 2026)

La pagina comune `/gestionale/impostazioni/piano` segue il modulo attivo:
in Ormeggio mostra soltanto lo stato dell’abbonamento alla piattaforma, la
scadenza e i giorni residui restituiti da `/api/v1/subscription`. Nessuna voce
marketplace, commissione, attivazione, acquisto o storico nella vista Ormeggio.
La voce di navigazione resta disponibile anche senza abbonamento attivo; la
richiesta «fin quando» è stata interpretata come visualizzazione della scadenza.
Quando il canone non è obbligatorio, il messaggio chiarisce che l’accesso resta
consentito; quando è obbligatorio invita a contattare NaBoat. Nessuna modifica
a prezzi, pagamenti, requisiti di accesso o API. La vista Noleggio conserva i
servizi esistenti, anche per le aziende che abilitano entrambi i moduli.

Verifiche locali in sola lettura su account Ormeggio e misto, desktop/telefono.
Aggiunti sei controlli browser su validità reale, contenuto, telefono, scadenza
e separazione delle viste. Typecheck e lint senza errori (244 warning storici),
confini rispettati. Build e collaudo isolato: **903 PASS, 0 FAIL**, inclusi
256 Chrome, con database e codice temporanei rimossi.

### Attività: lavori prioritari e vista Kanban (10 ottobre 2026)

La pagina `/gestionale/ormeggio/da-fare` apre sull’elenco dei lavori. Catalogo
«Servizi e attività offerte» e selettore «Apri le attività di una barca» sono
sezioni indipendenti, espandibili e inizialmente chiuse sotto i lavori. Le
compilazioni restano conservate quando si richiude una sezione.

Selettore Lista/Kanban con ricerca, filtro stato e «Assegnate a me» condivisi.
La lista mantiene i lavori aperti prima dei completati; la bacheca ha le
colonne Da fare, In corso e Completato. Pulsanti e trascinamento permettono
avvio/completamento tramite le operazioni esistenti. I completati sono solo
consultabili dalla bacheca: rettifiche e storni restano nella scheda barca.
Il completamento con addebito mantiene il permesso importi anche trascinando.
Sul telefono le colonne scorrono all’interno della bacheca; i pulsanti
consentono le stesse operazioni senza trascinamento.

GET attività accetta il filtro `stato` validato. La pagina carica in parallelo
fino a 200 lavori aperti e gli ultimi 200 completati: lo storico non sottrae
spazio ai lavori da fare. Eventuali limiti raggiunti sono indicati. I lavori
completati non sono conteggiati in ritardo. Nessuna migrazione né modifica
alle regole economiche o ai permessi. Aggiunte regressioni API su filtri,
isolamento e storico ampio, e browser su pannelli, viste, filtri, tastiera,
trascinamento, contabilizzazione e telefono.

Verifica locale in sola lettura: 11 attività reali identiche nelle due viste,
pannelli chiusi/apertura da tastiera e telefono senza overflow. Typecheck e
lint senza errori (244 warning storici), confini rispettati. Collaudo isolato
completo e build riusciti: **927 PASS, 0 FAIL**, inclusi 272 Chrome. Database
e codice temporanei rimossi. Il controllo dei pannelli chiusi usa la visibilità
effettiva del browser: Chrome può calcolarne comunque la geometria interna.

### Attività: priorità, card compatte e ritorni nel Kanban (10 ottobre 2026)

Estensione della bacheca descritta sopra: trascinamento consentito fra tutti
i tre stati, anche all’indietro. Il selettore di stato su ogni card permette
le stesse operazioni da tastiera e telefono. Riaprire un lavoro gratuito
azzera `completatoAt`; riaprire un lavoro contabilizzato chiede conferma e
usa lo storno esplicito esistente, rimuovendo l’addebito collegato. Annullare
la conferma conserva stato e conto. Addebiti pagati e permessi importi
mantengono i blocchi esistenti; ricompletare non duplica la voce di conto.

Migrazione `20261010150000_ormeggio_attivita_priorita`: campo SmallInt con
valore predefinito 2 e vincolo CHECK 1–3. API POST/PATCH validano la scala;
le attività esistenti ricevono priorità Normale. Il modulo di registrazione
propone Bassa/Normale/Alta (1/2/3 stelle) e note facoltative. Stelle visibili
in lista, bacheca e scheda della permanenza; priorità modificabile espandendo
la card Kanban. I lavori aperti sono ordinati prima per priorità, poi per data;
lo storico completati mantiene l’ordine dal più recente.

Card Kanban alte circa 114 px nella verifica desktop locale, con lavoro,
barca, cliente, posto, addetto, data, stato e stelle. «Note e priorità» espande
il dettaglio senza ingombrare la bacheca. Colonne interamente colorate con
tonalità leggere corallo, oro e verde. Il selettore Kanban usa tre linee
verticali, nome accessibile e tooltip. La scelta Lista/Kanban è conservata
nel browser per azienda e utente e ripristinata al ritorno o ricaricamento.
Migrazione applicata al database locale, client rigenerato e dev riavviato.

Verifiche finali: typecheck e lint senza errori (244 warning storici), confini
rispettati; build di produzione e collaudo isolato completi: **961 PASS,
0 FAIL** (675 API/regressioni, 286 Chrome). Coperti priorità non valide,
vincolo database, isolamento, modifica senza permesso importi, ritorni di
stato, data di completamento, conferma/annullamento dello storno, addebiti
pagati, creazione con note e stelle, compattezza, colonne colorate e memoria
della vista distinta per account. Per la selezione nativa da tastiera Chrome
headless usa la ricerca per iniziale («i» → In corso); le frecce non pilotano
il popup nativo in questa modalità. Verifica locale in sola lettura su tre
attività reali, desktop e telefono; nessun errore JavaScript. Tutte le 59
migrazioni applicate, dev pronto con DB e Redis; ambiente temporaneo rimosso.

### Kanban: note modificabili e card più basse (10 ottobre 2026)

«Note e priorità» contiene un editor note con Salva note e Annulla. Permette
aggiunta, modifica e cancellazione del testo; usa il PATCH attività esistente,
con limite 1000 caratteri e permessi invariati. Salva soltanto le note, senza
cambiare stato o conto. La bozza resta locale durante gli aggiornamenti in
background e dopo un errore; Annulla ripristina il valore salvato. L’editor
resta nella parte espandibile della card. Ridotti padding verticale e altezza
del riepilogo chiuso, conservando le informazioni principali e le stelle.
Nessuna modifica a schema o API. Aggiunte prove browser su modifica, aggiunta,
cancellazione, persistenza, annullamento, errore, aggiornamenti in background,
altezza chiusa e uso da telefono con addetto senza permesso importi.

Verifica locale Chrome in sola lettura: card chiuse alte circa 104 px (prima
114 px), editor accessibile nella parte espandibile, telefono senza overflow.
Typecheck e lint senza errori (244 warning storici), confini rispettati.
Build di produzione e collaudo isolato riusciti: **969 PASS, 0 FAIL**
(675 API/regressioni e 294 Chrome). Ambiente temporaneo rimosso.

### Attività: elenco per giorni e selettore Giorno/Priorità (10 ottobre 2026)

L’elenco è una sequenza di card espandibili con i giorni di scadenza sulla
sinistra, in ordine cronologico; i lavori senza data sono in fondo. La data
resta visibile scorrendo all’interno del relativo gruppo. Tutte le card
mostrano lavoro, barca, cliente, posto, addetto, scadenza, stato e stelle;
aprendole si possono leggere, aggiungere o modificare note e cambiare
priorità/stato. L’editor usa le stesse operazioni del Kanban. I nodi delle
card restano fratelli con chiavi stabili: cambiare gruppo per priorità non
perde apertura o bozza delle note.

Selettore compatto NaBoat «Giorno / Priorità» comune alle due viste:
Giorno ordina per scadenza, Priorità raggruppa da tre a una stella. La scelta
è conservata nel browser per azienda e utente insieme alla vista. Il Kanban
mantiene le tre colonne di stato, riordinate internamente secondo la scelta.
GET attività accetta `ordine=giorno|priorita` validato (default compatibile
priorita); l’ordinamento precede il limite di 200 aperte. Lo storico continua
a caricare i 200 completati più recenti, poi la vista li riordina. Richieste
superate da un nuovo caricamento non sovrascrivono l’ultimo risultato.

Nel Kanban aumentati titolo a 15 px, barca/posto a 13 px e altre informazioni
a 12 px, con contrasto più forte. Ridotte spaziature senza ampliare le card;
titoli su due righe quando necessario. L’icona addetto lascia più spazio al
nome. Nessuna migrazione o modifica alle regole economiche e ai permessi.

Verifica visiva locale in sola lettura su tre attività reali: elenco desktop
e telefono con giorni sulla sinistra, editor accessibile e nessun overflow.
Card Kanban tipiche alte circa 88 px, con titolo su due righe fino a circa
104 px. Typecheck e lint senza errori (244 warning storici), confini rispettati.
Build e collaudo isolato completi: **983 PASS, 0 FAIL** (681 API/regressioni,
302 Chrome). Coperti ordinamenti e limite 200, gruppi cronologici/senza data,
raggruppamento per stelle, note da elenco, apertura da tastiera, bozza durante
il cambio gruppo, leggibilità/dimensioni, preferenze e filtri comuni alle
viste. Ambiente temporaneo rimosso.

### Attività: separazione dei giorni e spaziatura Kanban (10 ottobre 2026)

Nell’elenco resta una distanza di 8 px fra attività dello stesso gruppo.
Fra giorni diversi aggiunti 32 px complessivi e una linea tratteggiata
leggera, estesa anche sotto la colonna della data. Il raggruppamento per
priorità conserva la spaziatura precedente. Le card mantengono chiavi stabili
anche cambiando gruppo, senza perdere apertura o bozze delle note.

Kanban con informazioni distribuite su due colonne interne: barca e posto,
cliente e data sulla sinistra; stato, addetto e apertura delle note sulla
destra. Titolo a 16 px, barca a 14 px e altre informazioni principali a 13 px.
Note e priorità si espandono su tutta la larghezza della card. Le colonne
mantengono una larghezza minima anche sui tablet, scorrendo in orizzontale
quando necessario per evitare che il testo compresso aumenti l’altezza.
Nessuna modifica a schema, API, ordinamento o operazioni sulle attività.

Verifica Chrome locale in sola lettura su 3 attività demo e 11 attività
di un account misto: distanze effettive 8/32 px, note accessibili e assenza
di overflow della pagina. Card standard alte 86 px (prima 88 px) alle
larghezze 390, 768, 1024, 1280 e 1440; titoli su due righe entro 104 px
nel collaudo isolato. Typecheck e lint senza errori (244 warning storici),
confini rispettati. Build di produzione e collaudo isolato completi:
**983 PASS, 0 FAIL** (681 API/regressioni, 302 Chrome). Ambiente temporaneo
rimosso; sviluppo locale disponibile su localhost:3000.

### Attività: archivio delle completate dei giorni passati (10 ottobre 2026)

La pagina Attività apre sempre la sezione operativa: lista e Kanban mostrano
tutti i lavori aperti, anche scaduti, e soltanto le completate con giorno di
scadenza uguale o successivo a oggi. Le completate con scadenza passata sono
consultabili nel tab «Attività completate», come elenco espandibile con
ricerca, assegnazione, ordinamento Giorno/Priorità, note e priorità modificabili.
Passare all’archivio conserva la preferenza Lista/Kanban della vista operativa.
Il riepilogo in alto conta soltanto le attività della sezione operativa.

Archiviazione automatica calcolata in lettura, senza eliminazioni o nuovi
stati. Per le attività senza scadenza vale il giorno di `completatoAt` nel
fuso Europe/Rome; per dati storici privi anche di questo valore si usa
`createdAt`. Il cambio giorno si riflette nel consueto aggiornamento della
pagina. Riaprire una card dell’archivio la riporta fra i lavori correnti;
ricompletare un lavoro con scadenza passata lo riporta subito nello storico.
Conferme di storno, addebiti pagati e permessi economici restano applicati.

GET attività aggiunge il filtro opzionale validato
`stato=completato&completate=attuali|archiviate`, applicato nel database prima
del limite 200. Le tre liste sono caricate separatamente, così uno storico
ampio non nasconde le attività correnti. Il limite è segnalato nella rispettiva
sezione. Le richieste prive del nuovo filtro, comprese le schede barca,
mantengono il comportamento precedente. Nessuna migrazione.

Typecheck e lint senza errori (244 warning storici), confini rispettati.
Build di produzione e collaudo isolato completi: **1003 PASS, 0 FAIL**
(694 API/regressioni, 309 Chrome). Coperti oggi/futuro/passato, separazione
senza sovrapposizioni, mezzanotte italiana, attività senza scadenza o timestamp
storici, limiti, validazione, isolamento e permessi; nel browser note in
archivio, riapertura, riarchiviazione, memoria della vista e uso da telefono.
Verifica locale in sola lettura su attività demo: due correnti e una nello
storico, con note accessibili e nessun overflow. Ambiente temporaneo rimosso.

### Statistiche e multiutenza Ormeggio (10 ottobre 2026)

Implementati i due brief forniti dall’utente. Definizioni, ruoli, migrazioni,
configurazione e prova su due dispositivi in
[`ORMEGGIO-STATISTICHE-MULTIUTENZA.md`](ORMEGGIO-STATISTICHE-MULTIUTENZA.md).

Nuova pagina `/gestionale/ormeggio/statistiche`, accanto a Economia: sei
indicatori, ciambella dei saldi attuali con dettagli paginati, andamento incassi
meno rimborsi, valore della custodia stimato e occupazione commerciale,
resa per area ordinabile/paginata. Filtri data inclusiva Roma, area, servizio
nell’URL e confronti con periodo equivalente/anno precedente. Calcoli lato
server, centesimi interi, selezioni mirate senza N+1. La pagina non modifica
conti, contratti o pagamenti. Formula di residuo uguale al dettaglio Economia;
crediti separati. Stima temporale della sola custodia, extra esclusi, futuro
programmato separato e copertura dei dati dichiarata. Capacità precedente
all’attivazione dello storico indicativa: nessun blocco attuale retroattivo.

`Appartenenza` affianca la relazione legacy `User.tenantId`: identità personale
riutilizzabile, ruolo/stato/permessi per azienda, selezione `/gestionale/aziende`.
Il server rilegge l’appartenenza a ogni richiesta protetta. Backfill dalle
relazioni attendibili esistenti e compatibilità dei vecchi flussi Noleggio.
Inviti Ormeggio limitati al prodotto, SHA-256, sette giorni, monouso/revocabili,
accettazione atomica per nuovi account o identità esistenti corrispondenti e
verificate. SMTP assente/fallito comunicato senza fingere l’invio. Gestione
Collaboratori riservata al titolare; protezione transazionale dell’ultimo owner.

Addetto con mappa, assegnazione di barche già censite, movimenti e attività
assegnate; Visualizzazione con mappa/essenziali, senza contatti/importi/storico
completo o scritture. `/gestionale/ormeggio/tv` richiede account dedicato in
sola lettura. Responsabile con permesso importi esplicito per dati economici,
Statistiche e documenti riservati. Revoca dalla richiesta successiva e pulizia
della vista al refresh/focus. Nessuna nuova infrastruttura realtime: focus e
polling di dieci secondi, controllo risposte fuori ordine, errori/offline.

Revisioni delle risorse condivise e `If-Match` sotto lock/ transazione; conflitti
409 senza sovrascrittura, nome autore quando visibile e bozze conservate.
`Idempotency-Key` su creazione permanenza e movimenti, con risposte persistite
per utente/azienda e filtrate nuovamente secondo i permessi al retry. Audit
coerente con la mutazione, sopravvive alla rimozione dell’appartenenza. Restano
vincoli EXCLUDE su barca/posto e intervalli `[dal, al)`; uno spostamento fallito
conserva l’origine, l’uscita in mare conserva la riserva commerciale.

Migrazioni locali additive `20261010170000`–`20261010200000`: appartenenze,
inviti, revisioni, indisponibilità e capacità storica, idempotenza e relazioni.
Client Prisma generato e sviluppo riavviato. Database locale aggiornato;
nessuna migrazione o deploy applicato in produzione. Nuovi test isolati in
`scripts/verifica-statistiche-multiutenza.mjs`; Chrome verifica anche due
sessioni indipendenti, riconnessione, revoca e layout 1440/768/390 px.

Collaudo finale della versione completa: **1096 PASS, 0 FAIL** (768 controlli
formule/API/regressioni e 328 Chrome), incluse due sessioni browser indipendenti,
riconnessione, revoca live e cambio filtri con risposta precedente ritardata.
Verificati retry senza duplicazione anche per le nuove attività; cauzioni
riconoscibili escluse e mostrate separatamente nei dettagli. Typecheck e lint
senza errori (255 warning); confini rispettati e build di produzione riuscita.
Tutte le 63 migrazioni applicate anche sul database vuoto di prova, poi rimosso.
Sviluppo locale su localhost:3000, PostgreSQL e Redis avviati; readyz conferma
entrambi disponibili. La prova con due dispositivi fisici è documentata per
l’utente; i test automatici usano due contesti browser distinti sullo stesso Mac.


### Collaudi automatici separati dagli account (11 ottobre 2026)

Su richiesta dell’utente, le prove automatiche devono restare esclusivamente
nell’ambiente temporaneo: nessuna fixture negli account reali o demo persistenti,
neppure prevedendo di pulirla dopo. Restano le prove delle persone e i dati demo
richiesti esplicitamente. Regola aggiunta anche ad `AGENTS.md` e `README.md`.

Pulizia applicata **solo al database locale**, dopo un dump privato: eliminate
213 aziende automatiche storiche (Smoke, Parse, Webhook, Conc) e le relazioni a
cascata, 46 clienti marketplace con patenti collegate, 93 richieste di contatto,
100 registrazioni di backup fittizi, 891 pagine SEO, 303 notifiche, 21 eventi
Stripe e 6150 voci di registro attribuibili alle fixture. Le 23 pagine SEO
aggiuntive erano riferimenti orfani delle barche `SMOKE-<timestamp>-Nol` create
nei vecchi collaudi dell’account Ormeggio Demo. Rimossi anche i gruppi di registro
che corrispondono alla sequenza automatica di quel test e riguardano soltanto
entità ormai eliminate. Gli eventi storici senza una firma affidabile restano:
non si eliminano attività potenzialmente umane per nome, data o sola assenza
dell’entità. Nessun ripristino delle impostazioni globali basato su supposizioni.

Conservate MALLARDO SRL, Golfo Charter Test, Demo Charter Napoli e Ormeggio Demo,
con account e contenuti. Confronto di impronte su 43 tabelle prima/dopo: dati
protetti e configurazione identici. Verificate in sola lettura dieci API del
pannello amministratore: tutte HTTP 200, senza riferimenti Smoke nelle risposte.
Nessuna verifica, pulizia o pubblicazione effettuata online.

`scripts/demo-pulisci.mjs` ora produce un’anteprima per firme combinate (nome,
email generata, timestamp, identità/appartenenze, riferimenti); `--conferma` applica
in transazione serializzabile dopo una seconda verifica. Non accetta più pattern
arbitrari; il vecchio SQL che cancellava per nome è disabilitato. Pagine SEO
modificate a mano e identità condivise con altre aziende vengono conservate.
I contatti richiedono anche i contenuti precisi della fixture; i clienti con
prenotazioni o recensioni in aziende conservate restano. La procedura va preceduta
da un backup e conserva i casi dubbi. I comandi locali caricano `.env.local`
mediante `node --env-file=.env.local scripts/demo-pulisci.mjs [--conferma]`.
Istruzioni VPS aggiornate in `DEPLOY.md` usando il servizio `tools`.

Guardia unica per tutti gli smoke, compresi browser, stabilizzazione e confini:
PostgreSQL locale, nome casuale esatto e indicatore del runner; per i test API
anche l’indirizzo deve corrispondere al server temporaneo avviato dal runner.
Un tentativo di esecuzione contro localhost:3000 è stato bloccato prima delle
scritture. Test unitari delle firme e delle guardie e regressioni della pulizia
(anteprima, conservazione, riferimenti SEO, identità condivise, piano obsoleto,
rollback completo e idempotenza) inclusi in `npm run test:isolated`.

Verifica finale: **787 PASS, 0 FAIL** (781 controlli API/regressioni e sei test
unitari), build di produzione riuscita, typecheck senza errori, lint senza
errori (255 warning storici), confini rispettati. Ambiente temporaneo rimosso;
nuova anteprima sul database locale restituisce zero residui riconosciuti in
tutte le categorie. Ripetuto il confronto sulle 43 tabelle protette dopo il
collaudo: impronte identiche, nessuna nuova fixture negli account persistenti.

### Statistiche Ormeggio più chiare e aree attive (11 ottobre 2026)

La dashboard presenta quattro caselle: Incassi netti, Da incassare, Occupazione
posti e Contratti iniziati. Rimossi dall’interfaccia la stima temporale dei
servizi e il valore medio contratto. Ogni casella apre una finestra con la
composizione, riepilogo, paginazione e collegamenti alle schede barca. Restano
le formule di Economia, le cauzioni escluse dagli incassi e i crediti separati.

Filtri, confronto e occupazione includono soltanto aree non archiviate e posti
non rimossi. Il confronto «Resa per area» appare con più aree attive e usa
incassi netti effettivi, occupazione e posti disponibili medi. Con una sola
area si mostra il nome di quella rimasta; senza aree compare uno stato vuoto.
I contratti e gli incassi delle aree rimosse restano nel totale generale, senza
cancellazioni. Un filtro di area propria rimossa viene normalizzato e rimosso
dall’URL; un’area altrui resta 404. Aggiornamento al focus, ogni dieci secondi e
tramite Aggiorna, anche nelle finestre già aperte.

Grafici con scelta Giorno/Settimana/Mese, evidenziazione al passaggio del mouse
o al focus e dettagli delle date selezionate al clic, tocco, Invio o Spazio.
Segmenti e legenda della ciambella sono cliccabili. Finestre contenute sul
telefono, Escape e ripristino del focus; protezione delle risposte fuori ordine
e pagine riallineate quando diminuiscono i risultati. Date mostrate nel fuso
Roma anche per le decorrenze a mezzanotte. Nessuna migrazione né deploy.
Dettagli e definizioni in `docs/ORMEGGIO-STATISTICHE-MULTIUTENZA.md`.

Verifiche finali: typecheck e lint senza errori (254 warning storici), confini
rispettati e build di produzione riuscita. Collaudo isolato completo: **1150
PASS, 0 FAIL** (802 API/regressioni, sei unitari e 342 Chrome). Coperti dettagli
riconciliati, permessi, aree rimosse, filtro obsoleto, aggiornamento della finestra
aperta, quattro caselle sul telefono, tastiera e clic sui grafici. Ispezionate
schermate desktop/telefono. Ambiente temporaneo rimosso; sviluppo locale pronto
su localhost:3000, readyz conferma DB e Redis disponibili.

### Dimensioni uniformi dei grafici (11 ottobre 2026)

I tre grafici delle statistiche sono in riquadri uguali: tre colonne su desktop,
una su tablet/telefono, righe della stessa altezza e area grafica fissa a 192 px.
Il grafico dell’occupazione non occupa più l’intera larghezza del desktop.
Titoli, spaziature e legende allineati; viewBox dei grafici cartesiani adattato
ai riquadri compatti per conservare la leggibilità. Nessuna modifica ai calcoli.
Typecheck, lint e confini senza errori. Verifica Chrome in sola lettura sui dati
locali a 1440/768/390 px: riquadri uguali per larghezza e altezza, grafici di 192 px
su tutte le viste e nessuno scorrimento orizzontale. Nessun dato automatico creato.

### Rimozione del profilo Visualizzazione (11 ottobre 2026)

Collaboratori Ormeggio propone solo Responsabile e Addetto, oltre al Titolare.
Tolti opzione, descrizione e indicazioni che suggerivano un account
Visualizzazione per il monitor. La vista TV resta in sola lettura ed è accessibile
con i profili attuali, senza modificare i loro permessi operativi o economici.
Inviti e modifiche rifiutano il vecchio profilo; vecchi inviti non accettabili.
Eventuali appartenenze precedenti mostrano «Ruolo da aggiornare» al titolare e
non accedono più alle API Ormeggio, anche con una sessione già aperta. La pagina
iniziale spiega come chiedere un nuovo ruolo. Riassegnazione esplicita, senza
promozioni automatiche; sospensione/rimozione, identità e storico conservati.
Il valore nell’enum DB resta per compatibilità con i dati storici. Nessuna nuova
migrazione, nessuna modifica automatica agli account persistenti, nessun deploy.

Verifiche finali: typecheck senza errori, lint senza errori (254 warning storici),
confini rispettati e build di produzione riuscita. Collaudo isolato completo:
**1163 PASS, 0 FAIL** (812 API/regressioni, sei unitari, 345 Chrome). Coperti
rifiuto del ruolo via API, inviti precedenti inutilizzabili senza creare account,
riassegnazione dal pannello, accesso con sessione esistente e vista TV Addetto.
Schermata Collaboratori ispezionata. Ambiente temporaneo rimosso; sviluppo locale
attivo con DB e Redis disponibili.

### Conto barche: collegamento tra addebiti e incassi (12 ottobre 2026)

«Segna pagato» ora chiede metodo e data, registra il solo residuo dell’addebito e
crea un Payment pagato con relazione a permanenza e voce. Pagamento, stato e audit
nella stessa transazione. Gli incassi generali coprono automaticamente le voci;
eccedenze come credito della sosta, voci gratuite senza pagamenti da zero euro.
Gli stati mostrati sono calcolati dagli incassi reali, con quote parziali visibili.
Gli addebiti precedenti segnati pagati senza copertura mostrano «Incasso da
verificare» e richiedono una registrazione esplicita con metodo e data reali.
Nessun incasso inventato o riconciliazione automatica degli account persistenti.

Calcolo condiviso in `src/modules/ormeggio/conto.ts`: conto barca, elenco addebiti,
Economia, mappa, PDF, contratto pubblico e residui delle Statistiche. Rimborsi
riusciti detratti una sola volta, cauzioni escluse. Crediti separati per sosta:
non nascondono il debito di altre barche. I pagamenti di oggi conservano l’orario
reale per attribuire l’incasso all’area corretta; quelli storici usano la data
indicata. Attività con incassi protette da storni/rettifiche che cancellino lo
storico, anche quando il pagamento era generale o parziale. Risposte di modifica
con revisione aggiornata; lock del conto prima della risorsa, controllo del
residuo confermato e protezioni dei salvataggi ripetuti. Conto su telefono con
riepilogo sempre leggibile e voci/pulsanti senza tabella da scorrere lateralmente.

Migrazione additiva `20261011192504_ormeggio_incassi_addebiti` applicata localmente:
Payment.addebitoId opzionale, relazione e indici. Client generato e sviluppo
riavviato su localhost:3000. Flussi e permessi Noleggio conservati. Nuovo collaudo
`scripts/verifica-conto-ormeggio.mjs` incluso in `npm run test:isolated`; nessuna
scrittura automatica su account reali/demo e nessun deploy. Guida in
`docs/ORMEGGIO-CONTI.md`.

Verifiche finali: typecheck senza errori, lint senza errori (254 warning storici),
confini rispettati e build di produzione riuscita. Collaudo isolato completo:
**1209 PASS, 0 FAIL** (850 API/regressioni, sei unitari, 353 Chrome), incluse 38
verifiche specifiche del conto e otto nuove verifiche browser. Schermata telefono
ispezionata; ambiente temporaneo rimosso. `/api/readyz` conferma database e Redis
disponibili sul server locale riavviato.
