# AGENTS.md — NaBoat Gestionale

Istruzioni per agenti AI (OpenCode) che lavorano su questo progetto.

## Cos'è
Gestionale multi-tenant per noleggio barche: pagine + API nello stesso progetto Next.js.
Ogni azienda (tenant) vede solo i propri dati. Lingua dell'interfaccia: italiano.

## Stack
- Next.js 15 (App Router) + React 19 + TypeScript
- PostgreSQL 15 + Prisma 5
- Redis (rate-limit)
- Tailwind CSS 3 (token colori NaBoat: deep #052f3f, ocean #087f8c, sea #23a6a6)
- Auth: JWT (jose) in cookie httpOnly + bcrypt + TOTP (2FA)
- Pagamenti: Stripe (`stripe`) + SMTP (`nodemailer`) + immagini (`sharp`)

## Comandi
```bash
docker compose up -d db redis      # avvia DB e cache (porte 5434/6380 via override locale)
npx prisma migrate dev             # applica/crea migrazioni
npm run db:seed                    # crea il superadmin
npm run db:seed:test               # dati demo (tenant "Golfo Charter Test")
npm run dev                        # http://localhost:3000
npm run build                      # build di produzione
node scripts/smoke-test.mjs http://localhost:3000   # test end-to-end
```
Nota: il DB locale è esposto sulla porta **5434** (la 5432 è spesso occupata). Vedi `.env.local.example`.

## Convenzioni di codice
- Niente commenti nel codice se non strettamente necessari.
- Ogni endpoint in `src/app/api/v1/...` DEVE chiamare `requireTenant(req)` (o `requireSuperadmin()` per `/admin`).
- Ogni query deve essere filtrata per `tenantId`. Mai query senza scoping.
- Validazione input con **Zod** (`safeParse`), errori 422; 401 non autenticato; 403 permesso/tenant; 404 non trovato; 409 conflitto.
- Testo UI in italiano; nomi di codice in inglese o italiano coerente con l'esistente.

## Dove mettere le cose
- Nuova pagina: `src/app/<nome>/page.tsx` (client component se interattiva).
- Nuova API: `src/app/api/v1/<risorsa>/route.ts`.
- Logica condivisa: `src/lib/*` (db, session, tenant, guard, ratelimit, totp, turnstile, mailer, storage).
- Schema DB: `prisma/schema.prisma` → poi `npx prisma migrate dev --name <nome>`.

## Regole di sicurezza da non violare
- Mai rimuovere `requireTenant`/`requireSuperadmin` dagli endpoint.
- Mai disattivare il controllo `tenantId` nelle query.
- Mai committare `.env`/`.env.local`.
- Se tocchi l'autenticazione, mantieni: cookie httpOnly, SameSite=lax, secure in produzione.

## Pagamenti (Fase 2) — regole specifiche
- Le chiavi Stripe sono **cifrate a riposo** (`src/lib/payments.ts`: AES-256-GCM con chiave derivata da `AUTH_SECRET`). Non decifrarle mai per restituirle via API: le API mostrano solo il booleano «configurato».
- Il pagamento è **multi-azienda**: ogni azienda ha il proprio account. Ogni query su `Payment` deve filtrare per `tenantId`.
- Attivo solo se `pagamentiAttivi && !pagamentiBloccatiNaBoat && tenant.status === "active"` (`paymentConfig()`); NaBoat può bloccare da `/admin`.
- Il link pubblico `/paga/[token]` non ha login: l'unica credenziale è il `payToken` (casuale, con scadenza). Non aggiungere dati sensibili in quella pagina o in `GET /api/v1/payments/public/[token]`.
- La fee NaBoat matura **solo** se `origineCanale === "naboat"` (RFQ D1/D3). Al cliente la commissione è mostrata come **una sola voce** «Commissioni di servizio» = fee NaBoat + commissione fornitore (RFQ D7).
- Il webhook Stripe (`/api/v1/payments/webhook`) si autentica con la firma; il `tenantId` arriva dai metadata della sessione ma la firma va sempre verificata con il segreto di quell'azienda.
- Rimborso (RFQ D8): parziale per regola, ammesso solo fino a `rimborsoOreMinime` prima dell'uscita; la fee NaBoat non si rimborsa.

## Resoconto economico
- `src/lib/reports.ts` calcola incassi, spese e margine. **Formula del margine:** `prezzo noleggio incassato − fee NaBoat − commissione fornitore − spese`.
- Le spese sono nel modello `Expense` (categoria, importo in centesimi, data, barca opzionale). Ogni query deve filtrare per `tenantId`.
- Gli importi sono **sempre in centesimi interi** (`*Cent`), mai float. Formattazione solo in UI con `toLocaleString("it-IT")`.
- `/api/v1/reports/summary` accetta `from`/`to` e `format=csv` (CSV con BOM per Excel, separatore `;`).

## Servizi NaBoat (due aree separate ma comunicanti)
- **Gestionale**: `attivazione` (una tantum, non scade) + `manutenzione_mensile` / `manutenzione_stagionale` (una stagione = 6 mesi). Sono le voci che il noleggiatore paga a NaBoat (account Stripe della piattaforma, `PLATFORM_STRIPE_SECRET_KEY`).
- **Marketplace**: fee percentuale **solo** sulle prenotazioni con `origineCanale = "naboat"`. Un noleggiatore può usare solo il gestionale: spegnendo `Tenant.moduloMarketplace` la fee diventa 0 ovunque (`paymentConfig()` la azzera).
- **Listino** in `PlatformSettings` (riga `id = "singleton"`): `prezzoAttivazioneCent`, `canoneMensileCent`, `canoneStagionaleCent`, `feeNaboatPctDefault`, `abbonamentoObbligatorio`. Ogni azienda può avere **override** (`Tenant.prezzoAttivazioneCent`, `canoneMensileCent`, `canoneStagionaleCent` — null = listino generale); `listinoPerTenant()` fa la fusione.
- **`Subscription.tipo` è testo libero** (`attivazione` | `manutenzione_mensile` | `manutenzione_stagionale`): non è più un enum, per restare configurabile. `abbonamentoAttivo()` filtra i tipi che iniziano con `manutenzione`; `attivazionePagata()` cerca `attivazione`.
- **Solo NaBoat** modifica listino, fee e modulo marketplace (`/api/v1/admin/subscriptions`, azioni `listino`, `condizioniAzienda`, `creaManuale`, `attiva`/`annulla`). Lo schema di `/api/v1/payments/settings` è `.strict()`: se un'azienda prova a inviare `feeNaboatPct` riceve 422.
- Con `abbonamentoObbligatorio` attivo, `requireTenant` blocca con **402** chi non ha una manutenzione attiva. Le API `/api/v1/subscription` usano `requireTenant(req, { ignoraAbbonamento: true })` per permettere il pagamento: non rimuovere questa eccezione.
- Il rinnovo si accoda alla scadenza (`dataPartenza`); NaBoat può registrare a mano attivazione e canoni (bonifico).

## Altro implementato (portale azienda)
- **Identità azienda**: `Tenant.logoUrl` + nome mostrati nel menu dal componente `src/components/TenantBadge.tsx` (client, legge `/api/v1/auth/me`). Modifica da `/api/v1/tenant` (PATCH, solo owner) e logo da `/api/v1/tenant/logo` (riusa `savePhoto`, quindi passa da `sharp`).
- **Ruolo skipper**: `requireTenant` accetta `skipper` ma **solo per GET/HEAD** → lo skipper consulta, non modifica. Resta la sola consultazione: non aggiungere eccezioni senza decisione esplicita.
- **Manutenzione**: modello `Maintenance` (`/manutenzione`). Lo stato è calcolato (scaduto / in scadenza entro 30 giorni / programmato / eseguito). Segnare un intervento come eseguito crea una `Expense` di categoria `manutenzione` (una sola volta, controllo per descrizione+barca).
- **Listino**: modello `Tariffa` (`/listino`), per barca o generale (`boatId` null) e per tipo/stagione. Preventivo: `GET /api/v1/tariffe?boatId&data&tipo`. Stagione alta = 1 giugno–30 settembre (funzione `stagioneDi` nel route). Il Calendario propone il prezzo dal listino.
- **Turni**: `GET /api/v1/turni` è una vista derivata dalle prenotazioni con `skipperId` (non è un modello proprio).
- **Meteo**: `GET /api/v1/meteo` chiama Open-Meteo (gratuito, nessuna chiave) usando `Boat.lat`/`Boat.lon`. Giudizio indicativo; il blocco uscita crea un normale `Block`.

## Cauzione, contratto, check-in e promemoria
- **Cauzione con blocco carta**: `/api/v1/payments/cauzione` (POST avvia, PATCH rilascia/addebita). Usa Stripe Checkout con `payment_intent_data.capture_method = "manual"`: i soldi **non** vengono incassati finché non si addebita. Il webhook con `metadata.tipo = "cauzione"` salva `cauzioneIntentId` e porta lo stato ad `autorizzata`. L'addebito crea un `Payment` nel registro incassi. **Attenzione:** i blocchi carta scadono dopo ~7 giorni, quindi la cauzione si autorizza vicino all'uscita.
- **Contratto digitale**: `contrattoToken` sulla prenotazione, pagina pubblica `/contratto/[token]` + `/api/v1/contratto/public/[token]`. La firma registra nome, data/ora e IP (`cf-connecting-ip`). Non si può firmare due volte.
- **Check-in/check-out**: `src/lib/presenze.ts` (logica condivisa) + rotte `POST /api/v1/bookings/[id]/checkin` e `/checkout`. Il check-out senza check-in è rifiutato. Le foto si caricano da `/api/v1/uploads` con `bookingId` + `tipo=checkin|checkout`.
- **Promemoria**: `POST /api/v1/promemoria/invia`. Dal portale (owner/operatore) invia solo le proprie prenotazioni; da cron con l'intestazione `x-cron-secret` (env `CRON_SECRET`) invia per tutte le aziende attive. Marca `promemoriaInviatoAt` solo se l'invio è riuscito.
- **Chiamate a Stripe**: avvolgere sempre in try/catch e rispondere 422 con messaggio chiaro — le chiavi finte o scadute non devono diventare errori 500.

## SEO delle pagine pubbliche
- **Il gestionale resta sempre noindex**: `src/app/robots.ts` blocca tutto (elenco `PRIVATE`) finché `PlatformSettings.seoPubblicheAttive` è false. Non allentare questa regola: le pagine di lavoro non devono finire sui motori.
- `src/lib/seo.ts` genera i testi dai dati reali per **piattaforma, azienda, barca, skipper**. I campi `titoloAuto`/`descrizioneAuto`/`keywordsAuto` sono rigenerabili; i campi senza suffisso sono le modifiche manuali di NaBoat e hanno la precedenza (`effettivo()`).
- Rigenerazione automatica: approvazione azienda, creazione/modifica barca, creazione skipper. Più il pulsante «Rigenera tutti i testi» in `/admin/seo`.
- Una riga `SeoPage` per entità (`@@unique([tipo, refId])`). **Attenzione:** in Postgres i `null` non entrano nei vincoli di unicità, quindi la pagina della piattaforma (`refId = null`) si gestisce con findFirst + update/create, non con upsert.
- Slugs unici e leggibili (`slugify`); `/sitemap.xml` si popola solo con `seoPubblicheAttive = true` e pagine `pubblica && !noindex`, così non si segnalano indirizzi inesistenti.
- La modifica è **solo di NaBoat** (`/api/v1/admin/seo`, schema `.strict()`); l'azienda vede la propria SEO in sola lettura da `/api/v1/seo`.

## Copie di sicurezza (comandate dal pannello)
- Le impostazioni stanno in `BackupSettings` (singleton) e si gestiscono da **`/admin/backup`**: attivo, `ogniOre`, `retentionCopie`, `includiFoto`, `destinazioneLocale/ObjectStorage/Ftp`, `soloDatabase`, `macchinaDelTempo`, `replicaAttiva`+`replicaHost`, `registroCompleto`, `avvisoEmail`.
- `GET /api/v1/backup/piano` (header `x-cron-secret`) restituisce cosa eseguire e apre una riga in `BackupRun`; `POST /api/v1/backup/esito` chiude la riga e manda l'email di avviso se l'esito è `errore`. **Gli interruttori del pannello comandano lo script**, non il crontab.
- `scripts/backup-orchestrator.sh` è l'unica riga di cron sul VPS: legge il piano ed esegue solo ciò che è attivo. Gli script Node girano nel servizio compose **`tools`** (`docker compose run --rm -T tools node scripts/...`) perché **sul VPS Node non è installato sull'host**. Non richiamare `node` direttamente dal crontab.
- **Backup completo**: `scripts/backup-completo.sh` (gira sull'host) crea un unico `.tar.gz` con database + `uploads` + configurazione. Contiene segreti e foto dei clienti: permessi 600, mai in cartelle pubbliche. In produzione le foto stanno in `./uploads`, in locale in `./public/uploads`: entrambi i percorsi sono gestiti.
- **Ripristino**: `scripts/ripristino-completo.sh` da quell'archivio; salva i file esistenti come `.pre-ripristino-*`.
- **Registro completo**: `src/lib/audit.ts` → `traccia()` scrive in `AuditLog.dettagli` i valori prima/dopo (solo i campi cambiati) quando l'impostazione è attiva. Non deve mai bloccare l'operazione principale (errori ignorati). L'azienda consulta `/registro` via `GET /api/v1/audit`.

## Sito pubblico e portale: un solo dominio (naboat.it)
- **Stessa applicazione, un solo indirizzo**: su `naboat.it` convivono il sito pubblico (home, Chi siamo, Contatti, presentazione) e il portale (accesso, registrazione, gestionale). `app.naboat.it` **reindirizza** a `naboat.it` (regola nel `Caddyfile`): non va più usato nei link. Le regole sugli indirizzi stanno in `src/lib/sito.ts`, che **non deve importare il database** (lo usa anche `src/middleware.ts`).
- **Home**: `src/app/page.tsx` — sul dominio del sito rende `src/components/sito/HomePubblica.tsx`; sul portale locale (sviluppo/altri host) reindirizza a `/oggi`. Testi e foto stanno in `PlatformSettings.homeTitolo/homeSottotitolo/homeImmagine` (modificabili da NaBoat in `/admin`), con predefiniti in `HOME_PREDEFINITA` e lettura server in `src/lib/home.ts`.
- **Il middleware non cambia più dominio**: le pagine pubbliche del sito sono aperte a tutti, tutto il resto (gestionale, pagamenti, contratti) richiede la sessione e riporta a `/login` sullo stesso dominio. I pulsanti Accedi/Registra usano `appBase()`, che ora restituisce un percorso relativo.
- **Anteprima senza toccare il DNS**: `/anteprima` (richiede l'accesso) mostra la home come apparirà su naboat.it.
- **`robots.ts` e `sitemap.ts` sono consapevoli del dominio** (leggono `headers()`): sul sito aprono solo home/Chi siamo/Contatti, sul portale restano chiusi come prima. Non rimuovere quella lettura.
- **Portale in manutenzione**: campi `PlatformSettings.manutenzioneAttiva/manutenzioneTitolo/manutenzioneTesto`, gestiti dal pannello `/admin`. Quando è acceso, le pagine del sito mostrano `src/components/sito/Manutenzione.tsx` ai visitatori **senza sessione**; chi ha una sessione valida (NaBoat o aziende) vede il sito normale. Il controllo sta in `src/lib/manutenzione.ts` (`statoManutenzione()`) ed è usato da home, Chi siamo e Contatti; con la manutenzione accesa `robots.txt` chiude tutto sul dominio del sito. Sotto il messaggio c'è il collegamento «Accesso amministratore» verso `app.naboat.it/login`.
- **Sessione condivisa tra i due indirizzi**: `nb_session` viene impostata con `Domain=.naboat.it` quando l'host è naboat.it o un suo sottodominio (`dominioCookie()` in `src/lib/session.ts`), così l'accesso fatto sul portale vale anche per il sito (e il contrario). In sviluppo resta legata all'indirizzo locale. Non rimuoverla: senza, il sito non riconoscerebbe chi ha già fatto l'accesso.
- **Pagina «Vedi il progetto»** (`/progetto`): copia statica del vecchio sito di presentazione in `public/progetto/` (index.html, style.css, script.js, assets). L'indirizzo pulito funziona grazie alla regola `rewrites` in `next.config.js`; il percorso è pubblico sul dominio del sito (`PERCORSI_SITO`) e chiuso ai motori (`PRIVATE` in `robots.ts`). Il pulsante compare nel popup di manutenzione, nel menù e nel piede (`LINK_PROGETTO` in `src/lib/sito.ts`).
- La foto di apertura ricade su `loginImmagine` se non caricata; l'upload dal pannello usa `POST /api/v1/admin/piattaforma` con `campo=homeImmagine`.
- **Form contatti** (`/contatti`): `src/components/sito/FormContatti.tsx` → `POST /api/v1/contatti` (pubblico, nessun accesso). Campi: nome, cognome, telefono, email, **messaggio facoltativo** (max 1000 caratteri) e consenso privacy. Protezioni sovrapposte: campo esca `azienda` (risposta finta «ricevuto» **senza salvare**), tempo minimo di 2 secondi dall'apertura (`istante`), Turnstile quando le chiavi sono configurate, limite per IP (10/ora) e per email (3/ora). Nel messaggio i **link vengono rimossi** (`senzaLink`); un testo fatto solo di link viene scartato in silenzio come spam. I messaggi finiscono in `RichiestaContatto` (**nessuna azienda**: li legge solo NaBoat) e si consultano da `/admin/contatti` (`GET/PATCH /api/v1/admin/contatti`). L'avviso email va a `CONTATTI_EMAIL` (predefinito `info@naboat.it`); senza SMTP configurato il messaggio resta solo nel pannello e nel log.
- Il passaggio del DNS (record A di naboat.it dal vecchio hosting al VPS) è descritto in `../passaggio-a-vps.html`: lato server basta aggiungere il blocco `naboat.it` al `Caddyfile` e inoltrarlo ad `app:3000`.

## Logo e icone
- Il logo NaBoat è un disegno **bianco su trasparente**: su fondo chiaro serve la versione blu. Le immagini pronte stanno in `public/img/logo-naboat-bianco.png` (per fondi scuri) e `public/img/logo-naboat-scuro.png` (per fondi chiari).
- Icone del telefono e favicon: `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png` e `src/app/favicon.ico` — sono un «badge» blu NaBoat con il logo bianco centrato (leggibile anche su schede del browser chiare).
- Si rigenerano tutte con `node scripts/logo-assets.mjs` a partire da `design/logo-naboat.png`. Se cambia il logo, sostituire quel file e rilanciare lo script.

## Modulo Ormeggio (ormeggiatori e rimessaggi) — in costruzione
- **Fondamenta già in produzione (fase O1)**: tabelle `Area`, `Posto`, `Permanenza`, `Movimento`, `Attivita`, `ServizioCatalogo`, `Addebito`, `ContrattoOrmeggio`; campi `Tenant.tipoModulo`/`moduloOrmeggio`, `Boat.uso` (noleggio|custodia), `User.vedeImporti`, `Payment.permanenzaId`, `PlatformSettings.prezzoAttivazioneOrmeggioCent`/`canoneOrmeggioMensileCent`.
- **La regola «niente doppie assegnazioni» sta nel database**: due vincoli `EXCLUDE USING gist` su `Permanenza` (posto e barca, solo per le permanenze attive) nella migrazione `vincolo_permanenze`, con estensione `btree_gist`. Se un salvataggio viola la regola, l'API deve tradurre l'errore di vincolo in **409** con messaggio chiaro.
- **Registrazione**: si sceglie `modulo` (`noleggio`/`ormeggio`/`entrambi`) → scrive `Tenant.tipoModulo` + `moduloOrmeggio`.
- **Barche separate**: `GET /api/v1/boats` filtra per `uso` (default `noleggio`; `?uso=custodia` o `?uso=tutte`). Le pagine del modulo ormeggio devono sempre chiedere `?uso=custodia`, così i due mondi non si mescolano mai.
- **Piano completo** (fasi O1–O5, schema, regole, 6 verifiche di accettazione): `../ormeggio-piano.html`. **Guida funzionale del portale**: `../guida-portale.html`.

## File di riferimento
- `README.md` — avvio e panoramica
- `DEPLOY.md` — messa online (Aruba VPS), backup, restore, Cloudflare. **In cima c'è la sezione 0 «PROMEMORIA»**: leggila e ricordala all'utente prima di ogni messa online (pulizia dati di test, niente smoke test in produzione, RLS, segreti, configurazioni post-avvio).
- `PERIMETRO.md` — perimetro del progetto
- `GUIDA-INSTALLAZIONE.html` — guida per chi installa da zero
