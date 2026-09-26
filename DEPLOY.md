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
- [ ] Decidere se attivare la **RLS** (`prisma/rls.sql`): richiede ruolo DB non-superuser `app` + ogni query in transazione con `SET LOCAL app.tenant`. Refactoring dedicato su copia, con backup verificato. Finché non è fatta, l'isolamento è applicativo (coperto dai test).

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

## 3. Backup / restore / offsite

### 3.0 Come funziona: si comanda dal pannello
I metodi di backup si **attivano e disattivano da `/admin/backup`** (frequenza, foto sì/no, Object Storage, FTP, macchina del tempo, replica, registro completo, email di avviso).

Sul server va installata **una sola riga di cron**: lo script interroga il portale, riceve il "piano" ed esegue solo ciò che è attivo. **Cambiando gli interruttori nel pannello non serve più toccare il crontab.** La pagina mostra anche le ultime esecuzioni con esito, dimensione e destinazioni.

```bash
crontab -e
# incollare le righe mostrate in /admin/backup, in sintesi:
0 * * * * cd /opt/naboat && ./scripts/backup-orchestrator.sh >> ./backups/backup.log 2>&1
0 8 * * * cd /opt/naboat && docker compose run --rm -T tools node scripts/backup-verifica.mjs /app/backups >> ./backups/backup.log 2>&1
```
Serve `CRON_SECRET` nel `.env` (lo stesso dei promemoria). Gli script Node girano nel servizio **`tools`** del compose, perché sul VPS Node non è installato sull'host.

### 3.1 Cosa viene salvato
`scripts/backup-completo.sh` crea **un solo archivio** con: dump completo del database, cartella `uploads` (foto barche, loghi, foto check-in/out), `.env`, `docker-compose.yml`, `Caddyfile`, `Dockerfile`.
Contiene segreti e foto dei clienti: permessi 600, mai in cartelle pubbliche. In alternativa, con «solo database» attivo, si salvano solo i dump (utile se le foto sono già su Object Storage).

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
Rimette configurazione, foto e database, riavvia tutto e verifica che il portale risponda. I file esistenti vengono salvati come `.pre-ripristino-*`.
Restore del solo database: `gunzip -c backups/<file>.gz | docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB`

### 3.5 Registro completo delle modifiche
Con l'interruttore «Registro completo» attivo, ogni modifica importante (prenotazioni, barche, pagamenti, spese, listino, condizioni…) viene scritta nel registro con i **valori prima e dopo**. L'azienda lo consulta da **/registro**; NaBoat lo vede dal registro azioni. Attivo per impostazione predefinita.

### 3.6 Verifiche periodiche
- `bash scripts/restore-drill.sh` — mensile: ripristina l'ultimo dump in un database separato e verifica i conteggi (non tocca la produzione)
- La pagina `/admin/backup` mostra «Backup regolare / Da controllare» e gli ultimi 7 giorni
- Snapshot settimanale da pannello Aruba
- Nota disco: tenere i dump storici solo su Object Storage e sull'hosting, non sul disco del VPS


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
L'isolamento multi-tenant è oggi applicativo ed è coperto da test automatici.
`prisma/rls.sql` contiene policy pronte, ma per renderle **efficaci** servono due
passi non automatici: (a) l'app deve connettersi con un ruolo non-superuser `app`,
(b) ogni query di tenant deve girare in transazione con `SET LOCAL app.tenant`.
È un refactoring dedicato: pianificarlo a parte per non rischiare blocchi in produzione.
