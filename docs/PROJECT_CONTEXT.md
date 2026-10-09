# PROJECT_CONTEXT.md — NaBoat Gestionale

Contesto operativo per il passaggio a un nuovo agente AI. **Regole di modifica e
comandi**: vedi [`AGENTS.md`](../AGENTS.md). Qui c'è lo stato del progetto:
architettura, cosa è fatto, cosa manca, problemi noti, decisioni prese, servizi
esterni, variabili d'ambiente (solo nomi), test e prossimi passi.

Ultimo aggiornamento: 9 ottobre 2026.

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
- **Ultimo lavoro (non committato)**: Ormeggio interno, griglia uniforme con anteprima/trascinamento, proprietari modificabili ed eliminabili, economia collegata, 58 servizi modificabili; solo nome/tipo barca nei flussi Ormeggio (vedi §10).

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
