# Passaggio del progetto NaBoat — istruzioni per Lorenzo (e per il suo agente AI)

Questo documento spiega **come prendere in mano il progetto** e portarlo avanti. È scritto per essere letto anche da un agente AI: le regole del progetto stanno in `AGENTS.md`, i piani in `../*.html` (cartella `NABOAT`).

---

## 1 · In due righe: cosa è il progetto

Un gestionale multi-azienda per il noleggio barche, con sito pubblico e (in arrivo) marketplace. Stack: **Next.js 15 + React 19 + TypeScript + PostgreSQL + Prisma + Tailwind**, tutto in Docker sul VPS Aruba. In produzione su **naboat.it** (sito + portale). Il modulo **Ormeggio** è iniziato: le fondamenta ci sono, restano le fasi O2–O5 (vedi piano).

**Documenti da leggere, in quest'ordine:**
1. `AGENTS.md` — le regole del progetto (architettura, sicurezza, dove mettere le cose). **È il contesto principale per l'agente.**
2. `DEPLOY.md` — come si mette online, con la sezione 0 «PROMEMORIA» da leggere **prima di ogni deploy**.
3. `../ormeggio-piano.html` — il piano del modulo Ormeggio, con le fasi e le decisioni aperte.
4. `../guida-portale.html` — come funziona il portale, funzione per funzione.
5. `../portale-schema-completo.html` — il quadro completo (riferimento).
6. `README.md`, `PERIMETRO.md`, `GUIDA-INSTALLAZIONE.html`.

---

## 2 · Come ottenere il codice

Il codice è in un **archivio Git privato sul VPS**: `ssh://root@80.211.236.141/opt/git/naboat.git`.

Sul tuo PC (con la tua chiave SSH installata — vedi §3):

```bash
git clone ssh://root@80.211.236.141/opt/git/naboat.git naboat-gestionale
```

Se la chiave non è quella di default, indica quale usare:

```bash
git clone --config core.sshCommand="ssh -i ~/.ssh/naboat_lorenzo" ssh://root@80.211.236.141/opt/git/naboat.git naboat-gestionale
```

Gli aggiornamenti successivi: `git pull`.

> **Il repository non contiene segreti**: `.env` e `.env.local` sono esclusi (vedi `.gitignore`). Vanno chiesti a parte (vedi §3).

---

## 3 · Accessi e segreti da ricevere (canale sicuro, NON email/chat)

| Cosa | A cosa serve | Come riceverlo |
|---|---|---|
| **Chiave SSH** per entrare sul VPS | comandi sul server, `git clone`, deploy | vedi nota sotto |
| **File `.env`** (produzione) | configurazione del portale: database, `AUTH_SECRET`, `CRON_SECRET`, SMTP, Stripe | condivisione da un **gestore di password** (Bitwarden/1Password), mai in chiaro |
| **File `.env.local`** (sviluppo locale) | avvio sul tuo PC (database locale su porta 5434) | come sopra |
| **Pannello Aruba** | DNS, console/VNC, email del dominio | credenziali dal gestore di password |
| **Sito e portale** | `naboat.it` è pubblico; il portale richiede l'accesso | — |
| **Account NaBoat** | `admin@naboat.it` | dal gestore di password |

**La chiave SSH — modo pulito (consigliato).** Non far viaggiare una chiave privata in chat. Sul **tuo** PC:

```bash
ssh-keygen -t ed25519 -C "lorenzo@naboat" -f ~/.ssh/naboat_lorenzo
```

Poi manda a Max **solo la chiave pubblica** (`~/.ssh/naboat_lorenzo.pub`): verrà aggiunta al server e la vecchia chiave condivisa verrà rimossa. Così la tua chiave privata non è mai uscita dal tuo PC.

**Sicurezza**: l'accesso al server è **solo con chiave** (niente password via internet: era una scelta voluta — il server riceve tentativi di intrusione continui e ne blocca già decine al giorno). La password di root esiste e serve **solo dalla console del pannello Aruba**, come paracadute.

---

## 4 · Cosa installare sul tuo PC

| Strumento | Versione | Note |
|---|---|---|
| **Node.js** | 20 LTS o superiore | `node -v` |
| **Docker Desktop** | ultima | serve per database e cache in locale |
| **Git** | ultima | `git --version` |
| **VS Code** | ultima | con estensione per TypeScript |
| **Agente AI** | quello che usi (OpenCode) | apri l'agente **nella cartella del progetto**: legge `AGENTS.md` e capisce le regole |

---

## 5 · Primo avvio in locale (5 comandi)

```bash
# 1) copia i file di ambiente di esempio e compila i valori
cp .env.local.example .env.local      # poi inserisci database/segreti locali

# 2) avvia database e cache
docker compose up -d db redis

# 3) prepara il database (schema + migrazioni + dati demo)
npx prisma migrate dev
npm run db:seed          # crea l'accesso NaBoat
npm run db:seed:test     # dati dimostrativi (azienda «Golfo Charter Test»)

# 4) avvia il portale
npm run dev              # http://localhost:3000

# 5) test automatici (devono passare tutti)
node scripts/smoke-test.mjs http://localhost:3000
```

In locale il database è esposto sulla porta **5434** (vedi `docker-compose.override.yml` e `.env.local.example`).

---

## 6 · Le regole d'oro (da non sbagliare)

1. **Ogni endpoint API chiama `requireTenant`** (o `requireSuperadmin`): mai togliere. Ogni query filtra per `tenantId`: mai togliere. È l'isolamento tra aziende.
2. **I segreti non entrano nel repository.** Mai committare `.env`/`.env.local`.
3. **Prima di ogni consegna**: `npm run build` deve passare **e** `node scripts/smoke-test.mjs` deve dare **0 FAIL**.
4. **Non lanciare lo smoke test in produzione**: crea dati finti e cambia impostazioni globali. Solo in locale o su una copia.
5. **Prima di ogni deploy leggere `DEPLOY.md` §0 «PROMEMORIA»**.
6. **Deploy**: caricare i file **prima** di ricompilare, e ricompilare **sempre anche** il servizio `migrate` (altrimenti le migrazioni nuove non vengono applicate — è già successo).
7. **Non toccare le regole `noindex`**: il gestionale non deve finire su Google.
8. **I dati di prova vanno cancellati** prima di aprire ai clienti veri (`node scripts/demo-produzione.mjs --elimina`, `npm run demo:pulisci`).

---

## 7 · Come si mette online (produzione)

**Flusso consigliato (con Git):**

```bash
# sul tuo PC: lavoro, test, poi
git add -A && git commit -m "descrizione" && git push

# sul server
ssh -i ~/.ssh/naboat_lorenzo root@80.211.236.141
cd /opt/naboat
git pull
docker compose up -d --build app
docker compose build migrate
docker compose --profile migrate run --rm migrate
docker compose ps && curl -fsS https://naboat.it/api/readyz
```

> La cartella `/opt/naboat` sul server **non è ancora** una copia Git: la prima volta va convertita (`git init`, `git remote add origin /opt/git/naboat.git`, `git fetch`, `git checkout -f main`). I file non versionati (`.env`, `uploads/`, `backups/`) non vengono toccati. **Farlo con Max la prima volta**, insieme.

**Flusso attuale (senza Git, quello usato finora):** copiare i file modificati con `scp` e poi ricompilare. È descritto in `DEPLOY.md`.

**Attenzione**: ogni deploy ricompila l'immagine e riavvia l'app: 1–3 minuti in cui il portale non risponde. Si fa in una fascia tranquilla.

---

## 8 · Stato del progetto e cosa manca

**Fatto e in produzione:**
- Portale azienda completo: accessi con 2FA, ruoli (titolare/operatore/skipper), flotta, listino, calendario, prenotazioni, clienti, contratti con firma, check-in/out, promemoria, pagamenti online per azienda, cauzione con blocco carta, resoconto con margine, registro
- Pannello NaBoat: aziende, approvazioni, listino e accordi, blocco pagamenti, messaggi dal sito, SEO, aspetto, copie di sicurezza
- Sito pubblico su `naboat.it`: home, Chi siamo, Contatti (con antispam), pagina del progetto, **manutenzione** attivabile
- Copie di sicurezza giornaliere + verifica + ripristino, comandabili dal pannello
- Oltre **200 test automatici** che passano
- **Modulo Ormeggio — fase O1** (fondamenta): tabelle, vincolo anti-doppia assegnazione nel database, scelta del modulo in registrazione, barche separate noleggio/custodia, permesso «vede importi», listino ormeggio

**Da fare (in ordine di priorità):**
1. **Modulo Ormeggio, fasi O2–O5** — griglia, permanenze, servizi, conto, contratto e pagamento, collaudo. Piano e **7 decisioni aperte** in `../ormeggio-piano.html`.
2. **2FA da riattivare**: è temporaneamente disattivata per la demo (`REQUIRE_2FA=false` nel `.env`). Va rimessa a `true` **prima** di aprire ai clienti veri: si cambia la variabile e si ricrea il container.
3. **Chiavi da configurare**: SMTP Aruba (email), Turnstile (antibot), Stripe della piattaforma. Il sito funziona anche senza, ma le email non partono.
4. **Pagine legali** (Privacy, Cookie, Termini): da scrivere e collegare nel piede del sito.
5. **Dati demo da cancellare** e password da cambiare prima della messa online con clienti veri.
6. **Marketplace e SEO (Fase 2)**: schede pubbliche di aziende, barche, skipper; guide per zona. Piano in `../seo-napoli-piano.html`.
7. **Multilingua**: piano in `../multilingua-piano.html`.
8. **Stripe condiviso (Connect)**: spiegazione e passi in `../opzioni-pagamenti.html` e nel capitolo finale di `../guida-portale.html`.

---

## 9 · Come lavorare con l'agente AI

- Apri l'agente **dentro la cartella del progetto**: legge `AGENTS.md` e conosce già convenzioni, divieti e architettura.
- Fagli leggere il documento del modulo su cui lavori (es. `../ormeggio-piano.html`) prima di fare modifiche.
- Fai sempre chiudere il lavoro con **build + smoke test** prima di considerarlo finito.
- Le modifiche allo schema del database passano da **Prisma** (`npx prisma migrate dev --name nome`), mai a mano.
- Per le modifiche alla produzione: **prima in locale**, verifica, poi deploy.

---

## 10 · Checklist di consegna

**Max consegna:**
- [ ] Chiave pubblica SSH di Lorenzo installata sul server (e vecchia chiave condivisa rimossa)
- [ ] `.env` di produzione e `.env.local` di sviluppo (via gestore di password)
- [ ] Credenziali del pannello Aruba e dell'account `admin@naboat.it`
- [ ] Accesso al repository Git sul VPS verificato (`git clone` di prova)
- [ ] Mezz'ora insieme per il primo deploy con Git

**Lorenzo riceve e verifica:**
- [ ] `git clone` funziona
- [ ] `npm run dev` si avvia in locale e vede il portale
- [ ] `node scripts/smoke-test.mjs` dà 0 FAIL
- [ ] Riesce a fare un deploy di prova (modifica minima, es. un testo)

---

*Documento di consegna · rev 23/09/2026 · AppOfficina.it*
