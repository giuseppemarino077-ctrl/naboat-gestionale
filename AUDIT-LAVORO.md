# Registro di avanzamento — stabilizzazione NaBoat

Riferimenti: `Prompt_DeepSeek_NaBoat.md` (incarico), `Audit_NaBoat.md` (evidenze).
Baseline: commit `c8c41fc3dea4eec4ff0a17c75a70e29ee4f99ef0` (28/09/2026).
Ramo di lavoro: `stabilizzazione-audit`.
Consegna e matrici di verifica: `CONSEGNA-AUDIT.md`. Mappa URL: `MIGRAZIONE-URL.md`.

Stati: **corretto e verificato** · **corretto, verifica parziale** · **decisione richiesta** · **dipende da configurazione**.

## Registro dei 50 rilievi

| ID | Prio | Intervento | Verifica | Stato |
|---|---|---|---|---|
| A01 | P1 | Destinazione post-accesso unica, pagina `/gestionale/stato`, contenitore operativo bloccato per aziende non attive, sospensione che revoca le sessioni | smoke; `/gestionale/oggi` non raggiungibile da pending | corretto e verificato |
| A02 | P0 | Guardia identità `src/lib/identita.ts` (utente + sessionVersion) su me/2fa/promemoria/patenti; setup 2FA con fattore attivo richiede il codice corrente e usa segreto provvisorio; disattivazione revoca le sessioni | 2FA anon 401; migrazione totp; smoke | corretto e verificato |
| A03 | P0 | `src/lib/riferimenti.ts` per extraIds/portoId/modelloId/addettoId/boatIds; `rimuoviFoto` solo su foto in galleria | porto di altra azienda → 422; smoke | corretto e verificato |
| A04 | P0 | Calendario con proiezione per ruolo e filtro barche noleggio/non archiviate; skipper solo le proprie uscite, senza importi/note | smoke «skipper consulta il Calendario» | corretto e verificato |
| A05 | P0 | `puoVedereImporti`/`requireImportiOrmeggio`; ormeggio (permanenze, attività, contratti, catalogo) e noleggio (pagamenti, spese, resoconti, prenotazioni annidate) ripuliti dalle cifre senza permesso | smoke; controlli mirati | corretto, verifica parziale (PDF/storico non esaustivi) |
| A06 | P0/P1 | Archivio privato fuori da `public/` (`uploads-privati`), lettura unica locale/S3 + fallback legacy; volume compose | 200 autorizzato, 401 anonimo | corretto e verificato |
| A07 | P1 | Registrazione transazionale con accettazione versionata; inviti monouso con scadenza e scelta password; cliente non auto-verificato con token | smoke; migrazione inviti_e_consenso | corretto e verificato |
| A08 | P0 c. | Guardia d'ambiente su seed/demo; seed senza password predefinita | `NODE_ENV=production` → STOP | corretto e verificato |
| B01 | P0 | `src/lib/disponibilita.ts` unico (barca+skipper+preparazione) con transazione e lock ordinati in creazione, modifica, blocchi e richieste | 6 richieste simultanee → 1 successo; smoke | corretto e verificato |
| B02 | P1 | Validazione dello stato finale in modifica (capienza, uso, barca, patente dal campo, skipper libero) | smoke (passeggeri oltre capienza → 422) | corretto e verificato |
| B03 | P1 | Macchina a stati unica in `src/lib/presenze.ts`; check-in→`in_mare` e check-out→`rientrata` atomici, un solo audit, retry idempotenti | smoke | corretto e verificato |
| B04 | P1 | Comando unico di annullamento (PATCH e DELETE soft) con motivo/autore/versione, invalidazione token/Checkout, notifica una volta | smoke (una cancellazione, un evento) | corretto e verificato |
| B05 | P0 | DELETE blocchi con filtro obbligatorio, conferma per rimozioni multiple, audit | corpo vuoto/`{}`→422; id inesistente→404 | corretto e verificato |
| B06 | P1 | Richiesta pubblica senza sovrascritture; `src/lib/anagrafica.ts`; dedupKey ricalcolata; recupero ospite con link monouso + requireCliente | smoke; migrazione anagrafica_richieste_ospiti | corretto e verificato |
| B07 | P1 | `src/lib/aggiorna.ts` (evento/focus/polling 10s), refresh sospeso con form aperti, 409 con ricarica che conserva la bozza | smoke (409) | corretto e verificato |
| B08 | P1 | Creazione atomica (prenotazione+extra+prezzo+incasso) con chiave idempotente e hash payload | smoke; payload diverso→409 | corretto e verificato |
| B09 | P1 | `src/lib/calendario.ts` con IANA Europe/Rome; form con date/ore distinte; today/promemoria a confini Roma; [inizio,fine) | test puri mezzanotte/ora legale/multigiorno | corretto e verificato |
| M01 | P1 | Regola di pubblicabilità unica in `src/lib/marketplace.ts`, usata da catalogo/schede/sitemap/richieste e da POST barca | smoke (pubblicazione senza foto/prezzo→422; marketplace spento) | corretto e verificato |
| M02 | P1 | Limiti Free/Pro atomici con lock; blocco admin separato (`Boat.bloccataAdmin/...`), non aggirabile; eccedenti solo in pausa | smoke (blocco non aggirabile→409) | corretto e verificato |
| M03 | P1 | Servizio preventivo con precedenza tariffe; snapshot offerta (`preventivoSnapshot`); conferma/pagamento richiedono prezzo | smoke | corretto e verificato |
| M04 | P2 | `/noleggia` con filtri luogo/date/persone + avanzati, disponibilità condivisa, filtri in URL; contatori reali | smoke | corretto e verificato |
| M05 | P1 | Scadenza opzione configurabile, limiti durata/anticipo, rilascio idempotente da cron, disponibilità coerente senza job; nessuna scadenza retroattiva | smoke | corretto e verificato |
| M06 | P2 | Editor/anteprima profilo pubblico; switch di visibilità collegati; parametri non operativi disabilitati con spiegazione; tabella impostazioni in AGENTS.md | smoke | corretto; **decisione richiesta** per sogliaPatenteCv/prova/prezzi Pro |
| M07 | P1 | Patente con scadenza e stato reale (vs attestazione manuale); recensioni solo su rientrata, entro finestra, uniche; cookie cliente separato (`nb_cliente`) | smoke (login cliente non tocca l'operatore) | corretto e verificato |
| P01 | P0 | Residuo del prezzo unico (capitale/commissioni/cauzione/intenti); a residuo zero nessun Checkout; intento locale prima di Stripe con lock | smoke (300−100=200; residuo zero→422; annullata→422) | corretto e verificato |
| P02 | P0 | Firma sempre verificata; incasso solo con `payment_status` paid/no_payment_required e coerenza importo/valuta; `StripeEvent` idempotente e recuperabile | smoke + 15 test sintetici firmati | corretto, verifica parziale (Stripe live non testato) |
| P03 | P0 | `origineCanale` sempre dal DB; fee solo su naboat+marketplace; snapshot condizioni sull'incasso | smoke (canale diretto: fee 0) | corretto e verificato |
| P04 | P0 | Modello `Refund` con stati e idempotenza, tetto sul solo capitale (fee non rimborsabile), riconciliazione Dashboard | smoke | corretto, verifica parziale (rimborsi live non testati) |
| P05 | P0 | Area cliente, cauzione e resoconto sulle stesse allocazioni; data effettiva `paidAt`; noleggio/ormeggio distinti | smoke | corretto e verificato |
| P06 | P1 | Documentate le due alternative (fatturazione vs ripartizione); nessun trasferimento live | revisione | **decisione richiesta** |
| P07 | P1 | Matrice prodotto→diritti; decorrenze con inizio/fine; rinnovi serializzati e clamp fine mese; scadenze da cron | smoke | corretto, verifica parziale (pagamenti live non testati) |
| P08 | P1 | `parseImportoEuro` rigoroso (segni/lettere rifiutati, 2 decimali, locale italiano, centesimi interi) | 17 test parser; smoke (`-100`/`abc100`→422) | corretto e verificato |
| O01 | P1 | `AssegnazionePosto` con intervalli e vincoli EXCLUDE; trasferimento transazionale; griglia storica a qualunque data | smoke-ormeggio; backfill | corretto e verificato |
| O02 | P1 | Validazione+transazione; conversione custodia esplicita e senza prenotazioni attive; rettifica corrispettivo con permesso importi | smoke-ormeggio | corretto e verificato |
| O03 | P1 | `Addebito.attivitaId` unico; completamento/addebito atomici e idempotenti; `statoConto` con rettifica/storno | smoke-ormeggio | corretto e verificato |
| O04 | P1 | `Expense.maintenanceId` unico; spesa legata all'intervento; costo previsto/effettivo | smoke-ormeggio; 57 spese legacy segnalate | corretto e verificato |
| C01 | P0 | Versione congelata + hash; firma condizionale legata alla versione; nuova revisione senza riscrivere la firmata; legacy senza hash retroattivo | smoke | corretto e verificato |
| C02 | P1 | Outbox `Notifica` con dedup e retry; salvataggio≠consegna; pannello `/api/v1/admin/notifiche`; niente link nei log in produzione | smoke | corretto, verifica parziale (SMTP reale non testato) |
| C03 | P1 | Scadenza/versione token per scopo; ricontrollo stato; DTO minimi e `no-store`; storici consultabili senza nuove azioni | smoke; pagamento ormeggio con scadenza | corretto e verificato |
| U01 | P1 | Aree con layout distinti e segmenti reali `/gestionale/*`; redirect dai vecchi URL con query; API invariate | redirect 307; build; smoke | corretto e verificato |
| U02 | P2 | Navigazione snella con selettore modulo; Marketplace di sola presenza pubblica; viste riviste (calendario, dettaglio, flotta, admin); icone SVG | build; smoke | corretto; palette non ri-tinta (vedi decisioni) |
| U03 | P1 | Pagine legali pubbliche senza componenti di login; testi/versione configurabili con banner «configurazione incompleta» | 200 da anonimo; smoke | corretto; testi legali definitivi = decisione richiesta |
| U04 | P2 | Metadati/indicizzabilità su regola di pubblicabilità; canonical e slug precedenti; sitemap solo URL reali; aree private noindex | smoke | corretto e verificato |
| U05 | P2 | Componenti comuni (vuoto/loading/errore/avviso/dialoghi), error/not-found/loading per segmento, token colore, focus e scroll | build; smoke | corretto, verifica parziale (nessuna certificazione a11y formale) |
| T01 | P1 | ESLint flat non interattivo, `typecheck`, CI GitHub con PostgreSQL e migrazioni, smoke esteso (380+ controlli) | lint 0 errori; build; smoke | corretto e verificato |
| T02 | P0 ril. | `GET /api/version` (SHA da env di build) | risposta endpoint | corretto e verificato |
| T03 | P1 | `rls.sql` completo (29 tabelle) + ruoli, `conTenant()` dietro `RLS_ENABLED` (spento), verifica e rollback in DEPLOY.md; healthz liveness / readyz readiness | verifica-rls 29/29 | corretto; attivazione RLS = decisione richiesta |
| T04 | P1 | Autorità unica backup (orchestratore; servizio compose in profilo legacy), retention a copie reale, ripristino isolato verificato, archivi 600/700 | verifica-ripristino riuscita | corretto e verificato |
| T05 | P2 | Paginazione retro-compatibile con conteggi DB su prenotazioni/clienti/spese/incassi; finestra calendario 180gg; indici mirati | EXPLAIN; smoke | corretto e verificato |
| T06 | P2 | Documentazione allineata (AGENTS/README/DEPLOY/MIGRAZIONE-URL) e limiti dichiarati; nessuna rimozione rischiosa | revisione | corretto, **parziale** (estrazione route/pagine monolitiche non eseguita) |

## Esito complessivo

- **Fase 0** (baseline/release): completata.
- **Fase 1** (identità, approvazione, isolamento: A01–A08, B05): completata.
- **Fase 2** (denaro: P01–P08): completata.
- **Fase 3** (disponibilità e stati: B01–B09): completata.
- **Fase 4** (marketplace, account, piani: M01–M07): completata.
- **Fase 5** (ormeggio, contratti, comunicazioni: O01–O04, C01–C03): completata.
- **Fase 6** (aree e interfaccia: U01–U05): completata.
- **Fase 7** (operatività e rilascio: T01–T06): completata, con T06 parziale.

Verifiche automatiche a fine lavoro: `npm run lint` 0 errori, `npm run typecheck` 0 errori,
`npm run build` riuscita, `scripts/smoke-test.mjs` e `scripts/smoke-ormeggio.mjs` senza FAIL.

## Decisioni di prodotto ancora necessarie (§16 del prompt)

1. Incasso della fee NaBoat: fatturazione successiva o ripartizione automatica (Connect).
2. Chi sostiene le commissioni e politica dei rimborsi nei casi ambigui.
3. Durata delle opzioni e trattamento delle richieste già esistenti (introdotta, da confermare).
4. Legame attivazione/canoni/Free-Pro/ormeggio e prezzi effettivamente venduti.
5. Ambito del permesso `vedeImporti` (globale o per modulo) e consultazione storica dopo sospensione.
6. Testi contrattuali e legali definitivi (le pagine restano bozze finché non approvati).
7. Palette: allineare i colori dell'app ai token documentati (`#052f3f/#087f8c/#23a6a6`) o aggiornare i token al colore attuale.
8. Attivazione RLS in produzione (ruolo runtime dedicato e test su copia) e piano di cutover.
