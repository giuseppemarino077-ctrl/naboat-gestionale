# Registro di avanzamento — stabilizzazione NaBoat

Riferimenti: `Prompt_DeepSeek_NaBoat.md` (incarico), `Audit_NaBoat.md` (evidenze).
Baseline: commit `c8c41fc3dea4eec4ff0a17c75a70e29ee4f99ef0` (28/09/2026), ramo `main`.
Ramo di lavoro: `stabilizzazione-audit`.

Stati ammessi: **da verificare** · **confermato** · **corretto e verificato** · **già risolto con prova** · **dipende da configurazione** · **decisione richiesta**.

## Registro dei 50 rilievi

| ID | Priorità | Evidenza | Intervento | Test | Stato |
|---|---|---|---|---|---|
| A01 | P1 | registrazione → /oggi, navigazione gestionale visibile a pending | stato di onboarding unico + pagina attesa + destinazione post-accesso | V01, V02 | da verificare |
| A02 | P0 | `auth/2fa`, `auth/me`, `promemoria`, `patenti/foto` non verificano tutti sessionVersion; setup 2FA azzera fattore attivo senza riautenticazione | guardia identità uniforme (`src/lib/identita.ts`) + riautenticazione per cambio fattore + segreto provvisorio (`User.totpPendingSecret`) | V03, V04 | corretto; verifica parziale (401 anon, `/me` pending ok) |
| A03 | P0 | riferimenti cross-tenant (skipperId, extraIds, portoId, addettoId, boatIds); `rimuoviFoto` su URL arbitrario | validazione appartenenza (`src/lib/riferimenti.ts`) + cancellazione solo di foto in galleria | V05, V06 | corretto; portoId cross-tenant verificato; extra/boatIds/addetto implementati |
| A04 | P0 | `calendar` restituisce tutti i record all'azienda allo skipper | DTO per ruolo + filtro barche noleggio/non archiviate | V07 | corretto; smoke «skipper consulta il Calendario» ok; esclusione cifre da verificare |
| A05 | P0 | permesso importi non copre annidati/PDF/CSV/contratti/snapshot | capacità lettura/scrittura economica ovunque | V08 | da verificare |
| A06 | P0/P1 | privato sotto `public/`, S3 pubblico, CSP blocca S3 | deposito privato `uploads-privati/` fuori da public + lettura unica locale/S3 + fallback legacy | V09 | corretto e verificato (200 autorizzato, 401 anonimo) |
| A07 | P1 | cliente creato emailVerified=true; inviti collaboratori incompleti; registrazione non transazionale | inviti monouso + transazione + accettazione testi | V10 | da verificare |
| A08 | P0 cond. | password demo deterministiche; script demo possono toccare produzione | guardia d'ambiente + seed senza password predefinita | — | corretto e verificato (blocco con NODE_ENV=production) |
| B01 | P0 | modifica/blocchi non condividono lock/preparazione | servizio disponibilità unico | V11 | da verificare |
| B02 | P1 | PATCH passeggeri=60 accettato senza capienza | validazione stato finale | V12 | da verificare |
| B03 | P1 | check-in non porta in_mare | macchina a stati unica | V15 | da verificare |
| B04 | P1 | annullamento diverso fra PATCH e DELETE | comando unico con motivo/autore/versione | V16 | da verificare |
| B05 | P0 | DELETE blocchi con corpo vuoto → tutti i blocchi | filtro obbligatorio + conferma per cancellazioni multiple + audit | V13 | corretto e verificato (vuoto/`{}`→422, id inesistente→404) |
| B06 | P1 | upsert cliente su telefono sovrascrive; dedupKey non aggiornata | niente sovrascritture + dedup normalizzata | V17, V18 | da verificare |
| B07 | P1 | nessun refresh condiviso né controllo versione | invalidazione/refresh + 409 | V19 | da verificare |
| B08 | P1 | prezzo in PATCH separata; idempotenza assente | comando atomico + chiave idempotente | V14 | da verificare |
| B09 | P1 | fusi orari misti; multigiorno collassato | UTC + Europe/Rome, [inizio,fine) | V20 | da verificare |
| M01 | P1 | pubblicabilità diversa fra endpoint; POST senza foto/prezzo | regola idoneità unica | V30, V31 | da verificare |
| M02 | P1 | limiti Free/Pro aggirabili; moderazione confusa con pubblicazione | limiti atomici + blocco moderazione separato | V30 | da verificare |
| M03 | P1 | prezzo min fra unità eterogenee; richiesta senza snapshot | servizio preventivo + snapshot | V32 | da verificare |
| M04 | P2 | ricerca senza disponibilità; contatore skipper da storico | disponibilità condivisa + filtri URL | V32 | da verificare |
| M05 | P1 | da_confermare blocca senza scadenza | scadenza opzione idempotente | V33 | da verificare |
| M06 | P2 | impostazioni pubbliche incomplete; parametri non collegati | editor completo o disabilitazione spiegata | V34 | da verificare |
| M07 | P1 | patente doppia indicazione; cookie cliente/operatore condiviso | stato patente unico + sessioni separate | V35 | da verificare |
| P01 | P0 | saldo dal prezzo intero; ormeggio ripropone corrispettivo a residuo zero | debito residuo centrale | V21, V22 | da verificare |
| P02 | P0 | completed→pagato senza payment_status; no inbox eventi | evento persistito idempotente + verifiche | V24, V25 | da verificare |
| P03 | P0 | origineCanale dal client; fee su incasso diretto | origine dal DB + snapshot condizioni | V23 | da verificare |
| P04 | P0 | rimborso include fee NaBoat; retry non protetti | tetto rimborsabile + idempotenza | V26 | da verificare |
| P05 | P0 | basi economiche diverse (cliente/cauzione/report) | registro economico unico | V27 | da verificare |
| P06 | P1 | fee non trasferita (no Connect) | tracciabilità fee + alternative | — | decisione richiesta |
| P07 | P1 | canoni/Free-Pro/ormeggio non convergono | matrice prodotto→diritti | V29 | da verificare |
| P08 | P1 | parser accetta `-100`/`abc100` → +100 | parser rigoroso | V28 | da verificare |
| O01 | P1 | spostamento riscrive postoId; griglia non storicizza | assegnazioni temporali | V36 | da verificare |
| O02 | P1 | apertura/modifica permanenza non atomica | validazione+transazione | V37 | da verificare |
| O03 | P1 | completamento attività/addebito non atomici, no unicità | vincolo unico + transazione | V38 | da verificare |
| O04 | P1 | spesa manutenzione dedotta da descrizione | relazione esplicita intervento→spesa | V38 | da verificare |
| C01 | P0 | firma legata a dati correnti, non snapshot immutabile | versione congelata + hash + update condizionale | V39 | da verificare |
| C02 | P1 | notifiche best-effort, no outbox | outbox persistente con retry | V41 | da verificare |
| C03 | P1 | token senza scadenza/revoca/versione omogenei | ciclo token per scopo | V40 | da verificare |
| U01 | P1 | separazione affidata a liste di pathname | layout/route group distinti, redirect | V42 | da verificare |
| U02 | P2 | navigazione estesa, gerarchia poco chiara | selettore modulo + sezioni minime | V44 | da verificare |
| U03 | P1 | pagine legali montano navigazione gestionale | layout pubblico + testi versionati | V43 | da verificare |
| U04 | P2 | SEO non allineata alla pubblicabilità | metadati/indicizzabilità unici | V43 | da verificare |
| U05 | P2 | errori/loading/a11y non condivisi | componenti comuni + verifica responsive | V44 | da verificare |
| T01 | P1 | lint interattivo, nessuna CI | ESLint flat non interattivo + `npm run typecheck` + CI GitHub con PostgreSQL | V46 | corretto; lint 0 errori, typecheck e build ok; CI da eseguire |
| T02 | P0 rilascio | release non identificata | `GET /api/version` (SHA da env di build) | V48 | corretto e verificato (`sha` da GIT_SHA/BUILD_SHA) |
| T03 | P1 | RLS parziale, healthcheck su healthz | scoping prima, RLS dopo; readiness | V48 | da verificare |
| T04 | P1 | doppia schedulazione backup | inventario job + autorità unica | V48 | da verificare |
| T05 | P2 | liste troncate senza paginazione | paginazione retro-compatibile (array + `X-Total-Count`, involucro con `?page=`) + conteggi/filtri DB + finestra calendario 180g + catalogo su DB + indici | V45 + smoke T05 | corretto e verificato (smoke ok; EXPLAIN sugli indici) |
| T06 | P2 | regole duplicate, doc non allineata | servizi + DTO + doc aggiornata | — | parziale: doc aggiornata (AGENTS/README/DEPLOY/MIGRAZIONE-URL + registro), nessuna estrazione di route (rimandata per prudenza) |

## Diario delle fasi

- **Fase 0** — completata: ramo `stabilizzazione-audit`, registro, lint/typecheck/build non interattivi, CI, endpoint `/api/version`.
- **Fase 1** — in corso: corretti A02, A03, A04, A06, A08, B05 (P0). Restano A01 (onboarding/pagina attesa), A05 (permesso importi esteso), A07 (verifica email/inviti), B01–B04, B06–B09.
- **T05/T06 (questo intervento)** — paginazione retro-compatibile su prenotazioni/clienti/spese/incassi con conteggi nel DB e `X-Total-Count`; finestra calendario 180 giorni; catalogo pubblico filtrato/limitato nel DB; indici `Booking(tenantId,startAt)` e `Customer(tenantId,createdAt)` (migrazione dedicata, verificati con `EXPLAIN`); pagine con totale e «Mostra altri»; doc allineata (AGENTS, README, DEPLOY, MIGRAZIONE-URL). T06 resta parziale: non sono state estratte route monolitiche (nessuna rimozione per prudenza). Dettagli e limiti nel resoconto finale.
- Fasi 2–7 — da iniziare.

## Decisioni di prodotto in sospeso (dal §16 del prompt)

1. Incasso fee NaBoat: fatturazione successiva o ripartizione automatica (Connect).
2. Chi sostiene le commissioni e politica rimborsi nei casi ambigui.
3. Durata delle opzioni e trattamento delle richieste preesistenti.
4. Legame attivazione/canoni/Free-Pro/ormeggio.
5. Ambito del permesso `vedeImporti` e consultazione storica dopo sospensione.
6. Testi contrattuali definitivi.
7. Configurazione di produzione e identità della release.
