# Passare il progetto su un altro PC

Questo file viaggia con il codice. Serve a rimettere in funzione il gestionale NaBoat
su un altro computer con **codice + dati + foto** identici.

## Cosa viaggia con Git e cosa no
- **Con Git (questo repository):** tutto il codice, le migrazioni, gli script.
- **NON con Git (da copiare a parte):** i file `.env` e `.env.local` (segreti) e i dati
  del database e le foto (vedi `backup-dati/`).

## Prerequisiti sul nuovo PC
1. **Node.js** 20 o superiore
2. **Docker Desktop** avviato
3. **Git**

## Passi

```powershell
# 1. Scarica il codice (sostituisci con l'indirizzo del tuo repository privato)
git clone https://github.com/<utente>/<repo>.git naboat
cd naboat
```

2. **Copia i segreti**: metti nella cartella i file `.env` e `.env.local` (te li passi a parte,
   mai via Git). Senza questi, il portale non parte o non si collega al database.

```powershell
# 3. Dipendenze
npm ci

# 4. Avvia database e cache
docker compose up -d db redis

# 5. Applica la struttura del database
npx prisma migrate deploy
npx prisma generate
```

6. **Ripristina i dati** dal dump che hai in `backup-dati/naboat-db-*.sql`
   (il nome del container potrebbe variare: controllalo con `docker ps`).

```powershell
cmd /c "docker exec -i progetto-db-1 psql -U naboat -d naboat < backup-dati\naboat-db-AAAA-MM-GG.sql"
```

7. **Ripristina le foto**: estrai `backup-dati/naboat-uploads-*.zip` dentro `public\uploads`.

```powershell
# 8. Avvia il portale
npm run dev
# http://localhost:3000
```

## Accessi demo (in locale)
- NaBoat: `admin@naboat.it` / la password scelta in `.env.local` (`SUPERADMIN_PASSWORD`)
- Gli account demo (azienda e ormeggio) si creano con `npm run db:seed:test` e
  `node scripts/demo-ready.mjs`: gli script stampano a video le credenziali usate.
  In alternativa, per proteggere account già esistenti, usa `npm run demo:proteggi`.

## Verifica salute
```powershell
node scripts/smoke-test.mjs http://localhost:3000         # noleggio
node scripts/smoke-ormeggio.mjs http://localhost:3000     # ormeggio
```

## Nota sui segreti
I file `.env` / `.env.local` contengono password del database e `AUTH_SECRET`.
Non caricarli mai su Git, su servizi online pubblici o su chiavette condivise:
passali con un canale sicuro.
