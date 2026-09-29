# Consegna — stabilizzazione NaBoat

Baseline `c8c41fc`, ramo `stabilizzazione-audit`. Questo documento raccoglie le prove
richieste dal §15 del prompt: esito dei 50 rilievi (vedi `AUDIT-LAVORO.md`), matrice
delle verifiche V01–V48, mappa URL, ruoli, prodotto/diritti, istruzioni e rischi residui.

## 1. Cosa è cambiato (sintesi)

- **Identità e accesso**: guardia `identitaCorrente` su tutti gli ingressi sensibili;
  2FA con segreto provvisorio e revoca sessioni; azienda pending in `/gestionale/stato`
  senza accesso operativo; sessioni cliente separate (`nb_cliente`).
- **Isolamento**: validazione dei riferimenti fra aziende; archivio privato fuori da
  `public/`; permesso `vedeImporti` applicato su server.
- **Denaro**: residuo del prezzo unico, origine canale dal database, webhook idempotente
  e verificato, rimborsi tracciati, parser importi rigoroso, resoconto per data effettiva.
- **Prenotazioni**: servizio disponibilità unico con lock, stato finale validato,
  macchina a stati con check-in/out coerenti, annullamento unico, idempotenza, fusi orari.
- **Marketplace**: pubblicabilità unica, moderazione admin separata, preventivo con
  snapshot, ricerca con disponibilità, opzioni con scadenza, profilo pubblico completo.
- **Ormeggio**: storico posti con intervalli, addebiti/spese unici e collegati.
- **Contratti e comunicazioni**: documento congelato con impronta e firma condizionale,
  outbox notifiche con retry, ciclo dei token.
- **Interfaccia**: aree e layout distinti con `/gestionale`, componenti condivisi,
  accessibilità, paginazione.
- **Operatività**: lint/typecheck/build/CI, endpoint versione, RLS documentata e
  predisposta, backup con autorità unica e ripristino isolato verificato.

## 2. Matrice delle verifiche V01–V48

Legenda esito: **OK** = verificato con prova; **OK­parz** = implementato e provato in
parte; **MAN** = implementato, richiede verifica manuale/live; **DEC** = decisione.

| ID | Esito | Prova / limite |
|---|---|---|
| V01 | OK | smoke «pending bloccato»; `/gestionale/stato`; API operativa 403 |
| V02 | OKparz | sospensione revoca le sessioni (`sessionVersion`); refresh UI al focus |
| V03 | OKparz | `identitaCorrente` su me/2fa/promemoria/patenti; 401 anon; mismatch versione non testato via HTTP |
| V04 | MAN | setup 2FA su fattore attivo richiede il codice; test end-to-end non automatizzato |
| V05 | OKparz | portoId cross-tenant → 422; smoke B-non-A; extra/boatIds/addetto implementati |
| V06 | OKparz | cancellazione solo se in galleria; non automatizzato su file reali |
| V07 | OK | smoke «skipper consulta il Calendario»; proiezione senza importi |
| V08 | OKparz | ormeggio e noleggio ripuliti; PDF e storico non esaustivi |
| V09 | OKparz | locale: 200 autorizzato / 401 anonimo; S3 privato non provato live |
| V10 | MAN | invito monouso + token cliente; `REQUIRE_EMAIL_VERIFY` non forzato nello smoke |
| V11 | OK | 6 creazioni simultanee → 1 successo; blocco/prenotazione coperti dallo smoke |
| V12 | OK | capienza in modifica → 422; barca/patente/skipper |
| V13 | OK | DELETE blocchi vuoto/`{}` → 422; id inesistente → 404 |
| V14 | OK | idempotenza con prezzo/extra; payload diverso → 409 |
| V15 | OK | check-in→in_mare, check-out→rientrata, un solo evento |
| V16 | OK | PATCH e DELETE soft; ripetizione idempotente |
| V17 | OK | richiesta ospite non sovrascrive l'anagrafica |
| V18 | OK | link monouso + requireCliente con email coincidente |
| V19 | OK | `updatedAt` + 409; refresh al focus/polling |
| V20 | OK | test puri: mezzanotte, ora legale, multi-giorno, TZ browser diverso |
| V21 | OK | residuo 300−100=200 |
| V22 | OK | ormeggio saldato → nessun Checkout |
| V23 | OK | canale diretto → fee 0; origine dal DB |
| V24 | OK | webhook unpaid/firma/importo/valuta con eventi sintetici firmati |
| V25 | OK | duplicati, ordine invertito, evento prima del record |
| V26 | OKparz | tetto/idempotenza implementati; rimborsi Stripe live non eseguiti |
| V27 | OKparz | cauzione ≠ incasso; cattura distinta; Stripe live non eseguito |
| V28 | OK | parser: 17 casi (`-100`, `abc100`, virgola/punto, migliaia) |
| V29 | OKparz | diritti una volta, inizio/fine, fine mese; pagamenti live non eseguiti |
| V30 | OKparz | requisiti e limiti su POST/PATCH/upload; concorrenza parziale |
| V31 | OK | archiviata/sospesa/marketplace off/blocco admin esclusi |
| V32 | OK | ricerca con disponibilità; preventivo con extra; tariffe generale/specifica |
| V33 | OK | opzione scaduta libera subito; rilascio idempotente; nessuna scadenza retroattiva |
| V34 | OK | switch profilo/visibilità con effetto osservabile |
| V35 | OK | cookie cliente/operatore separati; logout/reset indipendenti |
| V36 | OK | smoke-ormeggio: trasferimento, conflitto, vista storica |
| V37 | OK | apertura in conflitto → 409; rettifica corrispettivo |
| V38 | OK | attività doppia non duplica; interventi omonimi distinti |
| V39 | OK | firma condizionale su versione; modifica non riscrive la firmata |
| V40 | OK | token scaduti/versions; prenotazione annullata non paga |
| V41 | OKparz | outbox con retry e dedup; SMTP reale non provato |
| V42 | OK | redirect vecchi→nuovi con query; layout distinti; nessun loop |
| V43 | OK | legali 200 da anonimo; sitemap con soli URL reali; account/documenti noindex |
| V44 | OKparz | correzioni a11y responsive a livello di codice; nessuna certificazione formale |
| V45 | OK | paginazione e conteggi; finestra calendario 180 giorni |
| V46 | OKparz | lint/typecheck/build in locale; CI aggiunta ma non eseguita su GitHub |
| V47 | OKparz | `migrate deploy` su DB vuoto; migrazione da fixture precedente non isolata |
| V48 | OKparz | ripristino isolato riuscito, `/api/version`, readyz; VPS reale non verificato |

Limiti trasversali: niente pagamenti/rimborsi/cauzioni Stripe **live**, niente SMTP reale,
niente verifica autenticata della produzione. I mock/simulazioni non sono dichiarati come
test integrati quando non lo sono.

## 3. Mappa URL e ruoli

La tabella completa vecchia→nuova è in `MIGRAZIONE-URL.md` (i vecchi URL fanno 307 verso
i nuovi, con parametri preservati). Sintesi delle aree: sito pubblico, `/area` cliente,
`/gestionale/accesso|registrazione|stato`, `/gestionale/*` operativo, `/gestionale/impostazioni/*`,
`/admin/*`, pagine token `/paga|contratto|contratto-ormeggio`.

Mappa dei ruoli:

| Ruolo | Cosa vede | Cosa può fare | Guardia server |
|---|---|---|---|
| superadmin (NaBoat) | `/admin` + tutto, con `?tenantId` | amministrazione, listino, moderazione | `requireSuperadmin` |
| owner | gestionale completo | tutto il proprio tenant | `requireTenant`/`requireAzienda` |
| operatore | gestionale, senza alcune impostazioni | operatività | `requireTenant`/`requireAzienda` |
| skipper | Oggi/Calendario/Turni/Meteo, solo le proprie uscite | sola consultazione (GET/HEAD) | `requireTenant` (blocca scritture) |
| addetto ormeggio | ormeggio | operatività; importi solo se `vedeImporti` | `requireOrmeggio`/`requireImportiOrmeggio` |
| cliente | `/area` | propri dati, patente, recensioni | `requireCliente` (cookie `nb_cliente`) |
| anonimo | sito pubblico + pagine token | richieste, firma/pagamento su token | token con scadenza/scopo |

## 4. Matrice prodotto → diritti

| Prodotto | Chi paga | Dove si configura | Diritti attribuiti | Verifica |
|---|---|---|---|---|
| Attivazione (una tantum) | azienda → NaBoat | `/gestionale/impostazioni/piano`, admin `subscriptions` | sblocca l'operatività se richiesta | smoke |
| Manutenzione mensile/stagionale | azienda → NaBoat | come sopra | abilita l'accesso (402 senza, se obbligatoria) | smoke |
| Piano Free marketplace | — | `PlatformSettings.pianoFree*` | limiti barche/foto; niente extra/collaboratori | smoke |
| Piano Pro marketplace | azienda (manuale) | `/admin/piani` | extra e collaboratori | smoke |
| Modulo Ormeggio | azienda → NaBoat | registrazione/listino | abilita `/gestionale/ormeggio` | smoke-ormeggio |
| Fee NaBoat marketplace | cliente (commissione) | `PlatformSettings.feeNaboatPctDefault`/override | matura solo su `origineCanale=naboat`; incasso = decisione P06 | smoke |

## 5. Avvio, migrazioni, test, rilascio, ripristino

```bash
docker compose up -d db redis
npx prisma migrate dev          # o: npx prisma migrate deploy
npm run db:seed                 # superadmin (SUPERADMIN_PASSWORD obbligatoria)
npm run db:seed:test            # dati demo (tenant "Golfo Charter Test")
npm run dev                     # http://localhost:3000
npm run lint && npm run typecheck && npm run build
node scripts/smoke-test.mjs http://localhost:3000
node scripts/smoke-ormeggio.mjs http://localhost:3000
node scripts/verifica-rls.mjs   # copertura RLS (attiva solo con RLS_ENABLED=true)
```

Rilascio: immagine con `GIT_SHA`/`BUILD_SHA` (esposti da `/api/version`); migrazioni con
`prisma migrate deploy`; liveness `/api/healthz`, readiness `/api/readyz`.
Ripristino: `scripts/ripristino-completo.sh` (archivio completo) oppure
`scripts/verifica-ripristino.sh` per una prova isolata; `scripts/backup-verifica.mjs`
richiede una prova di ripristino recente. Dettagli in `DEPLOY.md`.

## 6. Rischi residui e decisioni

1. Fee NaBoat: modello di incasso da scegliere (P06).
2. Rimborsi/commissioni: responsabilità e casi ambigui.
3. Durata opzioni e richieste già esistenti.
4. Relazione attivazione/canoni/piani/ormeggio.
5. Ambito di `vedeImporti` e consultazione storica dopo sospensione.
6. Testi legali e contrattuali definitivi.
7. Palette: allineare i colori ai token documentati o aggiornare i token.
8. Attivazione RLS in produzione (ruolo runtime dedicato + test su copia) e cutover.
9. Verifiche non eseguite per assenza di ambiente: Stripe/SMTP reali, VPS di produzione.
10. T06: estrazione di route/pagine monolitiche non eseguita (nessuna regressione introdotta).
