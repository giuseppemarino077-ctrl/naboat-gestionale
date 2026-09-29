# Deploy singolo VPS (Aruba Cloud VPS O2A4: 2 vCPU, 4 GB RAM, 40 GB, Ubuntu 24.04)

> Piano: VPS O2A4 — 6,29 € + IVA/mese (~7,70 € IVA inclusa), 25 TB/mese traffico.
> Verificare che l'IPv4 pubblico sia incluso nel piano (in caso contrario va aggiunto
> da pannello, ~3,65 € + IVA/mese). Datacenter consigliato: Italia.
> Con 4 GB la build sul VPS è al limite: se fallisce per memoria, usare build locale
> (`npm run build`) e copiare `.next`/immagine, oppure aggiungere swap.

## 0. ⚠️ PROMEMORIA — DA FARE PRIMA DI ANDARE ONLINE

### Pulizia e ambiente
- [ ] **Proteggere gli account con password nota** (mentre il portale è online con i dati demo): `npm run demo:proteggi` per vedere gli account coinvolti, `npm run demo:proteggi -- --conferma` per cambiare le password (vengono stampate una volta sola: salvarle). Copre superadmin, utenti delle aziende «Smoke» e account demo `marco@golfo.test` / `op@golfo.test`. **Da fare subito**, perché `robots.txt` e `noindex` impediscono a Google di trovarli ma non a chi conosce le guide.
- [ ] **Indicizzazione**: già bloccata (`public/robots.txt` + `<meta name="robots" content="noindex, nofollow">` in `src/app/layout.tsx`). Verificare dopo il deploy: `https://naboat.it/robots.txt`.
- [ ] **Cancellare i dati di prova** quando si passa ai clienti veri. In locale (Node sull'host): `npm run demo:verifica` (mostra cosa verrebbe rimosso, **non cancella**) e poi `npm run demo:pulisci`. **Sul VPS** (dove Node non è sull'host e gli script non stanno nell'immagine):
      ```bash
      cd /opt/naboat
      docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB < prisma/pulizia-dati-test.sql
      ```
      Il file SQL mostra quante aziende sta per cancellare, elimina le aziende «Smoke …» **a cascata** (30 utenti, 37 barche, 24 prenotazioni, 24 incassi, 6 spese, 7 abbonamenti) più le voci di `AuditLog`, e alla fine elenca le aziende rimaste. Fare prima un backup: `docker compose exec -T db pg_dump -U $POSTGRES_USER -d $POSTGRES_DB > backup-prima-pulizia.sql`
- [ ] **NON lanciare lo smoke test in produzione**: crea dati finti e cambia impostazioni globali (attiva per qualche secondo `abbonamentoObbligatorio`, sovrascrive il listino abbonamento con 39/129 €, attiva pagamenti con chiavi Stripe finte). Va lanciato su una **copia** oppure va reso autopulente prima.
- [ ] Decidere se attivare la **RLS** (`prisma/rls.sql`): richiede i ruoli DB `naboat_app` + `naboat_admin`, `RLS_ENABLED=true` e il contesto tenant in transazione. Procedura di attivazione e rollback in **§8**; copertura verificabile con `node scripts/verifica-rls.mjs`. Finché non è fatta, l'isolamento è applicativo (coperto dai test) e `RLS_ENABLED` resta false.

### Segreti da impostare nel `.env` (mai committare)
- [ ] `AUTH_SECRET` nuovo (`openssl rand -hex 32`), `POSTGRES_PASSWORD` forte, `SUPERADMIN_PASSWORD` cambiata dopo il primo accesso
- [ ] `REQUIRE_2FA=true` e `REQUIRE_EMAIL_VERIFY=true`
- [ ] **SMTP Aruba**: `SMTP_HOST=smtps.aruba.it`, `SMTP_USER`, `SMTP_PASS` della casella `@naboat.it`
- [ ] **Turnstile**: `TURNSTILE_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITEKEY`
- [ ] **Pagamenti aziende**: le chiavi Stripe le inserisce ogni azienda da `/pagamenti` (cifrate nel DB); webhook per azienda `https://naboat.it/api/v1/payments/webhook`
- [ ] **Abbonamento a NaBoat**: `PLATFORM_STRIPE_SECRET_KEY`, `PLATFORM_STRIPE_WEBHOOK_SECRET`; webhook `https://naboat.it/api/v1/subscription/webhook`
- [ ] **Promemoria automatici**: impostare `CRON_SECRET` (stringa lunga casuale) e aggiungere al crontab dell'host:
      ```bash
      0 18 * * * curl -fsS -X POST https://naboat.it/api/v1/promemoria/invia -H "x-cron-secret: <segreto>"
      ```
      Invia ai clienti con uscita il giorno dopo. Si può anche lanciare a mano dal portale (pagina Oggi).
- [ ] `APP_URL=https://naboat.it` (sito e portale vivono sullo stesso dominio)

### Dopo l'avvio
- [ ] **SEO delle pagine pubbliche** (solo quando andrà online il marketplace): in `/admin/seo` impostare dominio pubblico, titolo, descrizione, parole chiave di base e zona di riferimento, poi «Rigenera tutti i testi». L'interruttore «pagine pubbliche attive» va lasciato **spento** finché le pagine pubbliche non esistono: con esso spento `robots.txt` blocca tutto e la sitemap resta vuota. Il gestionale **non deve mai** essere indicizzato.
- [ ] **Impostare in admin NaBoat**: prezzo di attivazione, canone di manutenzione mensile e stagionale, fee marketplace proposta, interruttore «canone obbligatorio»; per ogni azienda eventuali accordi personalizzati e il modulo Marketplace acceso/spento
- [ ] Inserire **coordinate delle barche** (Flotta) per far funzionare il Meteo
- [ ] Caricare **logo e nome azienda** (Team → Dati dell'azienda) per ogni noleggiatore
- [ ] Impostare il **listino prezzi** per barca/stagione
- [ ] **Backup**: in `/admin/backup` scegliere i metodi attivi (frequenza, foto, Object Storage, FTP, macchina del tempo, replica, email di avviso) e installare sul VPS la riga di cron mostrata nella pagina. Da lì in poi **gli interruttori del pannello comandano i backup**: non serve più toccare il crontab. Dettagli in §3.
- [ ] **REGISTRO_SECRET**: verificare che `CRON_SECRET` sia impostato (serve a promemoria e backup)
- [ ] Decidere se spostare le **foto** su Object Storage (`STORAGE_DRIVER=s3`): non sarebbero più sul disco del server
- [ ] **Copie di sicurezza**: verificare che il primo backup risulti «regolare» in `/admin/backup` + **restore drill** di prova
- [ ] DNS `naboat.it` → IP del VPS (e `app.naboat.it` solo come reindirizzamento)
- [ ] Object Storage (rimandato): attivarlo per foto e backup offsite quando serve
- [ ] Collaudo finale **insieme a Lorenzo** (elenco test in `../messa-online-cliente.html`)

## 1. Prima volta sul VPS
```bash
apt update && apt install -y docker.io docker-compose-plugin ufw fail2ban
ufw allow 22,80,443/tcp && ufw --force enable
# fail2ban + SSH solo key:
# /etc/ssh/sshd_config -> PasswordAuthentication no, poi systemctl restart ssh
mkdir -p /opt/naboat && cd /opt/naboat
# copiare: docker-compose.yml Caddyfile Dockerfile .env (da .env.example, chmod 600)
# NON copiare docker-compose.override.yml (solo dev locale)
# Generare segreti: AUTH_SECRET=$(openssl rand -hex 32), POSTGRES_PASSWORD forte.
docker compose up -d --build
docker compose run --rm migrate            # applica le migrazioni (stage con CLI Prisma)
docker compose exec app node prisma/seed.mjs   # superadmin iniziale (poi cambiare password)
```

## 2. Aggiornamenti
```bash
cd /opt/naboat
docker compose pull caddy db redis
docker compose up -d --build app
docker compose build migrate     # obbligatorio: l'immagine delle migrazioni contiene i file di prisma/migrations
docker compose --profile migrate run --rm migrate
docker compose ps
curl -fsS https://naboat.it/api/readyz || docker compose logs app --tail 50
```
> ⚠️ Se si dimentica `docker compose build migrate`, la migrazione nuova **non viene applicata** e prisma risponde «No pending migrations» (sta guardando l'immagine vecchia). Verificare sempre l'esito con una query su `_prisma_migrations`.

**Liveness e readiness.** `/api/healthz` risponde se il processo è vivo e basta: è il `healthcheck` del container (un DB lento non deve far riavviare l'app). `/api/readyz` verifica anche database e Redis e va usato da proxy e monitor (es. `curl -fsS https://naboat.it/api/readyz`): risponde 503 se l'app non è pronta a servire traffico. Nessuno dei due espone segreti (solo booleani).

## 3. Backup / restore / offsite

### 3.0 Come funziona: si comanda dal pannello
I metodi di backup si **attivano e disattivano da `/admin/backup`** (frequenza, foto sì/no, Object Storage, FTP, macchina del tempo, replica, registro completo, email di avviso).

**Una sola autorità sui backup: l'orchestratore governato dal pannello.** Il vecchio servizio `backup` del compose (immagine `postgres-backup-local` con schedulazione autonoma `@daily`) è disattivato di default con `profiles: ["legacy-backup"]`: due schedulazioni insieme produrrebbero dump duplicati e retention incoerente (e il servizio autonomo non conosce gli interruttori del pannello). Per riattivarlo solo come emergenza: `docker compose --profile legacy-backup up -d backup`. Il ripristino non dipende da quale dei due ha creato l'archivio: gli script leggono lo stesso formato.

Sul server va installata **una sola riga di cron**: lo script interroga il portale, riceve il "piano" ed esegue solo ciò che è attivo. **Cambiando gli interruttori nel pannello non serve più toccare il crontab.** La pagina mostra anche le ultime esecuzioni con esito, dimensione e destinazioni.

```bash
crontab -e
# incollare le righe mostrate in /admin/backup, in sintesi:
0 3 * * * cd /opt/naboat && ./scripts/backup-orchestrator.sh >> ./backups/backup.log 2>&1
0 8 * * * cd /opt/naboat && docker compose run --rm -T tools node scripts/backup-verifica.mjs /app/backups >> ./backups/backup.log 2>&1
0 4 1 * * cd /opt/naboat && ./scripts/verifica-ripristino.sh >> ./backups/backup.log 2>&1
```
Serve `CRON_SECRET` nel `.env` (lo stesso dei promemoria). Gli script Node girano nel servizio **`tools`** del compose, perché sul VPS Node non è installato sull'host.

### 3.1 Cosa viene salvato
`scripts/backup-completo.sh` crea **un solo archivio** con: dump completo del database, cartella `uploads` (foto barche, loghi, foto check-in/out), **archivio privato `uploads-privati`** (patenti, verbali), `.env`, `docker-compose.yml`, `Caddyfile`, `Dockerfile`.
Contiene segreti e foto dei clienti: l'archivio è creato con `umask 077` e `chmod 600`, la cartella con `chmod 700`, e **non va mai messo in una cartella pubblica** (né su una destinazione pubblica). In alternativa, con «solo database» attivo, si salvano solo i dump (utile se le foto sono già su Object Storage).
La retention è quella scelta nel pannello (**numero di copie conservate**), applicata dallo script, più un limite in giorni di sicurezza (`BACKUP_KEEP_DAYS`).

### 3.2 Destinazioni
| Destinazione | Attivazione | Costo |
|---|---|---|
| Archivio sul server | interruttore «Archivio completo sul server» | incluso |
| Aruba Object Storage (S3) | interruttore + variabili `S3_*` | incluso nel piano |
| Hosting Aruba via FTP | interruttore + variabili `FTP_*` | **gratuito** |
| Secondo server (replica) | interruttore + indirizzo del secondo VPS | ~12 €/mese |

### 3.3 Macchina del tempo (ritorno a qualsiasi secondo)
Si attiva dal pannello; la pagina mostra la configurazione da applicare al database (archiviazione continua + sincronizzazione su Object Storage). Va collaudata sul VPS al momento dell'attivazione.

### 3.4 Ripristino completo su un server nuovo
```bash
cd /opt/naboat
./scripts/ripristino-completo.sh /percorso/naboat-completo-AAA-MM-GG_HHMM.tar.gz
```
Rimette configurazione, foto (incluse le private), database, riavvia tutto e verifica che il portale risponda. I file esistenti vengono salvati come `.pre-ripristino-*`.
Restore del solo database: `gunzip -c backups/<file>.gz | docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB`

### 3.5 Registro completo delle modifiche
Con l'interruttore «Registro completo» attivo, ogni modifica importante (prenotazioni, barche, pagamenti, spese, listino, condizioni…) viene scritta nel registro con i **valori prima e dopo**. L'azienda lo consulta da **/registro**; NaBoat lo vede dal registro azioni. Attivo per impostazione predefinita.

### 3.6 Verifiche periodiche
Un file di backup non prova da solo che sia ripristinabile: la verifica è **legata al ripristino**.
- `bash scripts/verifica-ripristino.sh [archivio]` — **mensile** (o dopo ogni modifica grossa): ripristina database e file in un ambiente separato (database temporaneo, cartella temporanea), verifica i conteggi e scrive la prova in `./backups/ripristino-ok.txt`. Non tocca produzione.
- `bash scripts/restore-drill.sh [archivio]` — stesso motore, richiamo per compatibilità.
- `node scripts/backup-verifica.mjs ./backups` — **giornaliero**: oltre a controllare che il backup sia recente e non troncato, controlla che la **prova di ripristino** esista e non sia più vecchia di `PROVA_RIPRISTINO_GIORNI` (default 35). Se manca, il cron manda l'avviso email: significa che non è stata eseguita la prova.
- **Al primo avvio**: eseguire subito una prova (`verifica-ripristino.sh`) e installare tutte e tre le righe di cron, altrimenti il controllo giornaliero segnala la prova mancante.
- La pagina `/admin/backup` mostra «Backup regolare / Da controllare», l'**ultimo successo**, gli avvisi reali (variabili mancanti, opzioni in conflitto) e gli ultimi 7 giorni.
- Snapshot settimanale da pannello Aruba; nota disco: tenere i dump storici solo su Object Storage e sull'hosting, non sul disco del VPS.


## 4. DNS (Cloudflare proxied)
- `naboat.it A -> IP VPS` (`app.naboat.it` reindirizza a `naboat.it`), `api.naboat.it A -> IP VPS`
- `www` + `MX` restano su hosting IT con SPF/DKIM/DMARC.

## 5. Sviluppo locale (Windows)
- `docker compose up -d db redis` (override espone 5434/6380, la 5432/6379 è di altri progetti)
- `.env.local` punta a `127.0.0.1:5434/6380`; `npx prisma migrate dev`, `npm run db:seed`, `npx next dev -p 3100`

## 6. Filtro antispam/antibot Cloudflare (gratis, anche con singolo VPS)
1. Zona naboat.it su Cloudflare; record `app` e `api` in proxy (nuvola arancione).
2. SSL/TLS: Full (strict); Caddy emette già certificati LE sul VPS.
3. Security → Bots: Bot Fight Mode ON.
4. Security → WAF: managed ruleset ON (regole base gratuite).
5. **Turnstile** (già implementato): creare sitekey + secretkey e metterle in `.env`
   (`NEXT_PUBLIC_TURNSTILE_SITEKEY`, `TURNSTILE_SECRET`). Se vuote, la verifica è disattivata.
6. UFW sul VPS: consentire 80/443 **solo** dagli IP Cloudflare (cloudflare.com/ips)
   + SSH dalla propria IP. Così `CF-Connecting-IP` usato dal rate-limit è attendibile.

## 7. Sicurezza applicativa (implementata)
- Sessioni JWT httpOnly, rate-limit su Redis (login 20/10min per IP + 10/10min per email; register 5/ora).
- **2FA TOTP** per ogni utente da `/sicurezza`; obbligatoria per owner/superadmin con `REQUIRE_2FA=true`.
- **Verifica email** del proprietario (`REQUIRE_EMAIL_VERIFY=true` blocca finché non confermata).
- **Turnstile** su login e registrazione.
- Header: CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy.
- Dipendenze aggiornate (Next.js 15.5.25); `npm audit` = 0 vulnerabilità.

## 8. RLS (attivazione opzionale, difesa in profondità)
L'isolamento multi-tenant è oggi **applicativo** (ogni query filtra per `tenantId`) ed è coperto dai test. `prisma/rls.sql` aggiunge la seconda barriera a livello di database. **Resta spenta di default** (`RLS_ENABLED=false`): finché non si completa il refactoring il comportamento è identico a oggi.

### 8.1 Modello
- `naboat_app` — ruolo runtime delle aziende: soggetto alle policy, vede solo le righe con `tenantId = app.tenant_id`. Il contesto si imposta **solo per la transazione** con `set_config('app.tenant_id', <id>, true)`, helper `conTenant()` in `src/lib/db.ts`.
- `naboat_admin` — ruolo di piattaforma (superadmin, cron, backup) con `BYPASSRLS` **controllato**: non è una policy aperta, è un percorso esplicito (`DATABASE_URL_ADMIN`). Le API di piattaforma usano `prismaPiattaforma()`.
- Letture pubbliche del marketplace (barca pubblicata, porto, listino, extra attivi, recensione pubblicata, prenotazioni recensite): policy di sola lettura senza contesto tenant.

### 8.2 Copertura
Lo scoping applicativo è la prima barriera ed è verificato dai test end-to-end (`node scripts/smoke-test.mjs`, `node scripts/smoke-ormeggio.mjs` contengono i controlli di isolamento fra aziende).
29 tabelle hanno `tenantId`; `prisma/rls.sql` è **idempotente** e crea per ognuna la policy `tenant_isolation`. Lo verifica `node scripts/verifica-rls.mjs` (in locale riporta «RLS non attiva», atteso). Con `--strict` segnala anche i buchi a RLS spenta.

### 8.3 Attivazione (solo su una COPIA, con backup verificato)
1. Backup completo e prova di ripristino: `bash scripts/backup-completo.sh` + `bash scripts/verifica-ripristino.sh`.
2. Sul database (superuser/owner): `psql -U <owner> -d naboat -f prisma/rls.sql`.
3. Impostare password reali ai due ruoli (sono creati con password casuale non nota) e aggiornare il `.env`:
   ```sql
   ALTER ROLE naboat_app   LOGIN PASSWORD '<password-app>';
   ALTER ROLE naboat_admin LOGIN PASSWORD '<password-admin>';
   ```
   ```
   DATABASE_URL=postgresql://naboat_app:<password>@db:5432/naboat?schema=public
   DATABASE_URL_ADMIN=postgresql://naboat_admin:<password>@db:5432/naboat?schema=public
   RLS_ENABLED=true
   ```
4. Far girare le query di tenant dentro `conTenant(tenantId, …)` e le rotte `/admin` + cron + backup con `prismaPiattaforma()`.
5. Collaudo: `node scripts/verifica-rls.mjs --strict`, `node scripts/smoke-test.mjs`, `node scripts/smoke-ormeggio.mjs`, verifica manuale di login, pagine pubbliche e richieste dal sito.
6. Non attivare in produzione senza aver provato il passo 5 su copia: l'autenticazione (utente cercato per email prima di conoscere l'azienda) e la scadenza richieste richiedono attenzione.

### 8.4 Rollback immediato
```sql
-- come owner del database
ALTER TABLE public."Booking" DISABLE ROW LEVEL SECURITY;  -- per ogni tabella
-- oppure tutte insieme:
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind='r'
             AND EXISTS (SELECT 1 FROM information_schema.columns col WHERE col.table_schema='public'
                         AND col.table_name=c.relname AND col.column_name='tenantId')
  LOOP EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.relname); END LOOP;
END $$;
```
Poi nel `.env`: `RLS_ENABLED=false` e `DATABASE_URL` di nuovo con l'utente owner, quindi `docker compose up -d app`. Il codice applicativo non va toccato: con RLS spenta `conTenant()` e `prismaPiattaforma()` si comportano come prima.

