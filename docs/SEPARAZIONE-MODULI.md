# Separazione interna Noleggio e Ormeggio

Decisione del 9 ottobre 2026: una piattaforma NaBoat con due prodotti distinti.
Questo intervento realizza i punti 1–7 concordati: servizi dedicati, abilitazioni,
operazioni di dominio, collegamenti economici/documentali, confini del Noleggio,
componenti/navigazione e verifiche automatiche. Resta un’applicazione Next.js con
un database, un deployment e gli indirizzi attuali. Nessuna migrazione dati.

## Struttura e responsabilità

```text
src/app/                         adattatori Next.js, URL e composizione dei moduli
src/modules/
  piattaforma/
    accesso-azienda.ts           sessione, ruoli, 2FA e abbonamento esistenti
    accesso-prodotti.ts          autorizzazione server per prodotto
    accesso-pagine.ts            controllo prima di aprire le schermate
    prodotti.ts                  regole di abilitazione e percorsi di ingresso
    documenti.ts                 impronta e serializzazione degli snapshot
    pagamenti.ts                 provider, cifratura, importi, residui e rimborsi
    piani-commerciali.ts         regole commerciali già esistenti
    resoconti.ts                 aggregati economici con sezioni distinte
    barche.ts / tipi-barche.ts   tassonomia e opzioni comuni, senza modelli
    navigazione.ts               tipi, ruoli e voci comuni
    use-prodotto.ts              scelta del prodotto nelle pagine comuni
    components/                 profilo interno azienda
    server/                     configurazione/webhook, upload e contabilità comuni
  noleggio/
    disponibilita.ts            lock, conflitti, preparazione e opzioni
    clienti.ts / presenze.ts    anagrafica e check-in/check-out del noleggio
    marketplace.ts              catalogo, preventivi e richieste pubbliche
    contratti.ts                snapshot Noleggio e condizioni
    contratto-link.ts           congelamento e revisioni del contratto Noleggio
    pagamenti.ts                checkout delle prenotazioni
    planning.ts                 regole di visualizzazione del calendario
    modelli-barche.ts            catalogo marca/modello esclusivo del Noleggio
    navigazione.ts              voci di Noleggio e marketplace
    server/                     operazioni delle API del prodotto
    views/                      schermate interne e sito del Noleggio
    components/                 calendario, schede e richiesta pubblica
  ormeggio/
    accesso.ts                  accesso al prodotto e permesso importi
    barche.ts                   lettura/modifica/creazione delle sole custodie
    regole.ts                   coordinate, deduplicazione, intervalli e conflitti
    servizi.ts                  catalogo iniziale dei 58 servizi
    contratti.ts                snapshot Ormeggio
    navigazione.ts              voci operative interne
    server/                     aree/posti, proprietari, permanenze, movimenti,
                                attività, addebiti, incassi, conti e documenti
    views/                      schermate Ormeggio
    components/                 griglia, anteprime, sagome e riepiloghi
src/lib/                        infrastruttura tecnica e compatibilità storica
```

Autenticazione, amministrazione NaBoat e area cliente di piattaforma conservano
la struttura condivisa esistente. Gli endpoint di prodotto esportano le operazioni
dai rispettivi moduli. La
validazione Zod, i controlli di accesso, le transazioni, i lock e le risposte HTTP
restano nell’operazione server del prodotto. Questo livello usa ancora Request e
NextResponse: la separazione è interna a Next.js, non un backend indipendente dal
framework. La gestione delle barche in custodia ha anche un servizio dedicato
separato dal trasporto HTTP.

Prisma/PostgreSQL, Redis, sessioni, email, storage, crittografia, audit e backup
restano servizi tecnici condivisi. I modelli Tenant, User, Boat e Payment conservano
gli identificativi e le relazioni. Una sola autorità sulle migrazioni.

## 1. Barche in custodia

API proprie: `GET/POST /api/v1/ormeggio/barche` e
`GET/PATCH /api/v1/ormeggio/barche/[id]`. Le schermate Ormeggio usano questi percorsi.
Le query filtrano tenant e `uso = custodia`; le modifiche rifiutano campi estranei
al prodotto, inclusi pubblicazione e marca/modello. Nome e tipologia continuano ad
aggiornare griglia e nuovi documenti; i contratti firmati non vengono riscritti.

La barca archiviata resta consultabile ma non modificabile. L’aggiornamento si
coordina con l’eliminazione del proprietario tramite lo stesso lock sulla riga
Proprietario; non può ripristinare una barca rimossa.

I vecchi indirizzi `/api/v1/boats?uso=custodia` e `/api/v1/boats/[id]` restano
adattatori di compatibilità, con i controlli del prodotto corretto. `uso=tutte`
compone le sole liste dei prodotti abilitati. La DELETE generica di una custodia
viene rifiutata: la rimozione operativa passa dal proprietario e conserva i conti.
Gli adattatori di composizione vivono in `src/app`, fuori dai singoli prodotti.

## 2. Abilitazioni e ruoli

Una funzione pura, `prodottiAbilitati`, governa API, pagine e menu:

| Configurazione | Noleggio | Ormeggio |
|---|---|---|
| `moduloOrmeggio = false` | sì | no |
| `moduloOrmeggio = true`, `tipoModulo = entrambi` | sì | sì |
| `moduloOrmeggio = true`, altro tipo | no | sì |

È la regola già usata dalla navigazione prima della separazione. Preserva anche
le configurazioni legacy: non normalizza o riscrive i record. L’audit locale
prima dell’intervento ha trovato 215 aziende Noleggio, una Ormeggio e una mista,
tutte coerenti. La verifica è stata di sola lettura.

`requireProdotto` richiama `requireTenant` oppure `requireAzienda`: restano validi
stato azienda, versione della sessione, 2FA, verifica email, abbonamento e ruoli.
Le API private del Noleggio usano `requireNoleggio` o `requireAziendaNoleggio`;
quelle Ormeggio conservano `requireOrmeggio` e i controlli importi. Prodotto non
abilitato: 403, anche chiamando direttamente l’API.

Le pagine dei prodotti verificano identità e abilitazione sul server e indirizzano
al prodotto disponibile. Il superadmin conserva l’interfaccia amministrativa
esistente; le API continuano a richiedere il tenant selezionato. Lo skipper resta
in sola consultazione nelle API ammesse del Noleggio e non accede all’Ormeggio.
I permessi sugli importi non vengono ampliati.

Restano accessibili gli ingressi comuni necessari (sicurezza, rinnovo, attesa),
le API pubbliche con token e i cron autenticati. I contratti e i pagamenti storici
non perdono i propri link per effetto del riordino.

## 3–5. Operazioni, contabilità e Noleggio

Le operazioni Ormeggio sono estratte dalle route senza riscrivere le transazioni
di assegnazione/trasferimento, i vincoli di sovrapposizione, lo storico dei posti,
l’archiviazione di aree/proprietari o la contabilizzazione idempotente delle attività.

Il Noleggio possiede prenotazioni, calendario, clienti, check-in/check-out,
flotta, listini, esperienze, extra, manutenzione, recensioni, marketplace e richieste.
Le operazioni di flotta e le nuove associazioni a listini/blocchi/manutenzioni
rifiutano le barche in custodia. La conversione esplicita prevista dall’Ormeggio
resta disponibile, con i vincoli esistenti; il collaudo di conversione usa ora
correttamente un’azienda mista.

Documenti: il motore comune conserva serializzazione, impronta e IP; ogni prodotto
costruisce il proprio snapshot. Token, revisioni, firme e contenuti acquisiti
restano conservati. PDF e nuovi documenti restano collegati alla stessa permanenza.

Pagamenti: provider, cifratura delle chiavi e utilità restano comuni; il checkout
delle prenotazioni appartiene al Noleggio. Webhook e configurazione restano comuni.
Nessuna modifica a provider, chiavi, versione Stripe o modalità di incasso.
Gli importi restano in centesimi e l’Ormeggio non genera fee marketplace NaBoat.

`/api/v1/payments` è il registro del Noleggio e filtra `permanenzaId = null`;
`/api/v1/ormeggio/incassi` restituisce solo pagamenti con permanenza. Conti,
addebiti e saldo Ormeggio restano accessibili anche nello storico del proprietario
rimosso. Spese e resoconti aziendali restano servizi economici comuni; gli aggregati
separati del resoconto sono preservati.

## 6. Schermate e navigazione

Le pagine App Router mantengono URL e struttura di navigazione; le implementazioni
sono in `views` del prodotto. Componenti griglia/sagome/anteprime appartengono
all’Ormeggio; calendario/planning/richiesta pubblica al Noleggio. Le pagine pubbliche
di catalogo, azienda e barca restano del Noleggio.

Ogni prodotto definisce le proprie voci di menu; il contenitore comune le compone
con Team, Sicurezza, Registro, Impostazioni e Servizi NaBoat. Le aziende miste
mantengono il selettore e ricordano il prodotto nelle pagine comuni.

Nel contesto Ormeggio, Impostazioni mostra identità e contatti interni, senza
anteprima o collegamenti pubblici. Nel Noleggio conserva l’editor pubblico esistente.
Non cambiano funzionalità del quadro posti, trascinamento, anteprime, dialoghi,
proprietari, catalogo o gestione dei conti.

## 7. Controlli automatici e collaudo

- ESLint vieta import diretti tra prodotti e dalla piattaforma verso i prodotti,
  inclusi i vecchi percorsi di compatibilità e gli adattatori App Router.
- `npm run check:boundaries` costruisce il grafo degli import locali TypeScript,
  inclusi re-export, import dinamici letterali e require letterali. Rifiuta anche
  dipendenze transitive vietate e chiamate esplicite ad API dell’altro prodotto.
- Lo stesso controllo verifica la presenza delle guardie nelle operazioni private;
  gli ingressi pubblici con token e le richieste pubbliche sono eccezioni esplicite.
- Il verificatore ha quattro regressioni proprie ed è eseguito in CI e nel collaudo
  isolato. Il controllo statico non dimostra lo scoping delle query: quello resta
  coperto dalle guardie, dalla revisione e dai test API.
- `scripts/verifica-separazione.mjs` prova aziende singole/miste/legacy, accessi
  vietati, API compatibili, riferimenti tra prodotti, isolamento tra tenant,
  registri economici, firme, revoca sessione, ruoli e reindirizzamenti delle pagine.
- Le regressioni Chrome verificano anche modifica della barca senza perdita di
  focus, griglia collegata, impostazioni interne e passaggio tra prodotti.

Collaudo finale dopo la correzione dell’idratazione: **660 PASS, 0 FAIL**
(386 generale, 50 API Ormeggio, 19 Oggi, 22 stabilizzazione, 79 separazione prodotti,
104 Chrome), su database temporanei
eliminati al termine. Typecheck e lint senza errori, con i 248 warning preesistenti;
build di produzione riuscita. Confini: 165 file di modulo, 472 file del grafo,
113 operazioni private e quattro regressioni del verificatore superate.

Le nuove prove hanno verificato anche l’adattatore POST del vecchio indirizzo
barche in produzione: la richiesta viene ricostruita dai suoi valori pubblici,
senza clonare l’oggetto Request intermediato da Next.js. I reindirizzamenti delle
pagine sono verificati sia come risposta HTTP sia nel formato streaming di Next,
oltre alla navigazione reale in Chrome. Il gestionale locale risponde regolarmente.
Lo schema Prisma è identico al checkpoint precedente all’intervento.

### Sviluppo locale dopo la conversione delle pagine

Dopo aver convertito una pagina client in un adattatore server, riavviare
`npm run dev`: Fast Refresh può conservare il precedente grafo client e segnalare
erroneamente `next/headers` nella catena `accesso-pagine → identita → session`.
Il riavvio risolve questa classificazione rimasta in memoria.

`useUtente` parte sempre da `null` sia sul server sia nel browser; la cache viene
letta nell’effetto dopo il montaggio. In questo modo il caricamento anticipato
dell’utente nel layout non modifica il primo rendering di una pagina ancora da
idratare. La richiesta utente resta condivisa. Una regressione Chrome controlla
il caricamento di Economia dopo il quadro, intercettando le eccezioni runtime.

## Compatibilità e ripristino

I file storici in `src/lib` e i vecchi percorsi dei componenti sono esportazioni
di compatibilità. Non contengono copie della logica. Il nuovo codice dei moduli
importa le implementazioni possedute dal modulo corretto; i file aggregatori
storici di contratti e pagamenti non vanno importati dai moduli.

Prima del primo intervento: copia di 445 file verificati in
`/private/tmp/naboat-base-separazione-mmlqffq3`. Prima del completamento dei punti
1–7: copia di 451 file con manifest SHA-256 verificato in
`/private/tmp/naboat-separazione-completa-g7j6rjk2`.

Sono copie locali del codice corrente, incluso il lavoro non committato, escluse
credenziali, file di ambiente, upload, database, backup dati, dipendenze e build.
Non sono backup del database; la cartella temporanea non sostituisce una copia
duratura o un checkpoint Git revisionato.

Il ripristino del solo intervento richiede il confronto con il manifest, il ritorno
dei file interessati e la rimozione selettiva dei nuovi file del refactor. Preservare
il lavoro precedente e le modifiche successive: non sovrascrivere tutta la cartella
e non usare reset indiscriminati. Non occorre ripristinare il database perché lo
schema e i dati operativi non sono modificati.

## Confini dell’intervento e fasi successive

I prodotti condividono ancora il modello Boat (distinto da `uso`), il registro
fisico Payment, autenticazione e infrastruttura. È una scelta del monolite modulare,
non la realizzazione di due applicazioni o database indipendenti. Le configurazioni
commerciali e il ciclo di vita degli abbonamenti conservano le regole attuali.

Il caso della stessa barca impiegata contemporaneamente in noleggio e custodia
richiede una decisione di prodotto: non viene risolto duplicando o convertendo
automaticamente i record. RLS resta disattivata; l’isolamento applicativo resta
obbligatorio. Hosting, DNS, cookie condivisi, segreti e servizi esterni non cambiano.

Dopo il collaudo si può riprendere il lavoro funzionale sull’Ormeggio (punto 8).
Due applicazioni nello stesso repository, deployment o domini separati (punti 9–12)
restano una valutazione futura e non sono compresi in questo intervento.
