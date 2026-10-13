# Statistiche e multiutenza Ormeggio

Implementazione del 10 ottobre 2026. Riguarda il gestionale interno Ormeggio;
riusa autenticazione, contabilità, audit e vincoli temporali esistenti.

## Uso

- **Statistiche**, accanto a Economia: indicatori, stato dei saldi, grafici e resa
  per area. Date, area e servizio sono conservati nell’URL. Il periodo iniziale
  va dal primo giorno del mese a oggi, nel fuso `Europe/Rome`.
- **Impostazioni → Collaboratori**: il titolare invita persone, cambia ruolo,
  autorizza gli importi, sospende, riattiva o rimuove accessi.
- **Cambia azienda**: selezione esplicita dello spazio di lavoro per chi ha più
  appartenenze. Cambiare azienda ricarica l’interfaccia e cancella lo stato locale.
- **Vista TV**, `/gestionale/ormeggio/tv`: disponibile a Titolare, Responsabile
  e Addetto, con comandi in sola lettura. Richiede sempre una sessione.

## Permessi

| Ruolo | Funzioni |
| --- | --- |
| Titolare | Gestionale completo, collaboratori, configurazione e abbonamento |
| Responsabile | Mappa, anagrafiche, operazioni sulle permanenze e attività; Economia, Statistiche e documenti economici solo con autorizzazione esplicita |
| Addetto | Mappa, assegnazione di barche già registrate, spostamenti, ingressi/uscite, stato Pronta e aggiornamento delle attività assegnate |

I profili assegnabili ai collaboratori sono solo Responsabile e Addetto.
Il precedente profilo Visualizzazione non è più disponibile, nemmeno negli inviti
o nelle modifiche via API. Eventuali appartenenze esistenti conservano identità e
storico, ma non accedono alle API Ormeggio; la pagina iniziale spiega come chiedere
un nuovo ruolo. Il titolare vede «Ruolo da aggiornare» e sceglie esplicitamente
Responsabile o Addetto. Nessuna conversione automatica aumenta i permessi.
I vecchi inviti a quel profilo non sono più accettabili e vanno revocati e ricreati.
Il valore resta nell’enum DB per leggere i dati storici: non serve una migrazione.

Il completamento di un’attività assegnata all’addetto può generare l’addebito
automatico al prezzo già registrato: non permette di leggerlo o modificarlo.
Documenti e anteprime che contengono importi conservano il controllo economico.
Un invito Ormeggio non concede Noleggio. I titolari mantengono i prodotti abilitati
per l’azienda. Restano validi approvazione, sospensione, abbonamento e 2FA.

`Appartenenza` collega account e azienda, con ruolo, profilo Ormeggio, prodotti,
permesso importi, stato e revisione. Ogni richiesta protetta rilegge questa
relazione: sospensioni e riduzioni dei permessi valgono anche con un JWT già
emesso. Rimuovere un’appartenenza conserva account, altre aziende e audit.
Un vincolo transazionale protegge l’ultimo titolare attivo, anche con richieste
concorrenti. Non viene creato un secondo sistema di autenticazione.

Gli inviti durano sette giorni, hanno token casuali conservati come SHA-256,
sono revocabili e monouso. L’accettazione è atomica. Un account esistente deve
essere autenticato con l’email invitata e verificata; un nuovo account verifica
quell’indirizzo tramite il possesso del token e sceglie la propria password.
Per reinviare si revoca l’invito precedente e se ne crea uno nuovo. Il vecchio
token smette di funzionare. Nessuna password viene scelta dal titolare.

SMTP usa la configurazione già prevista da `src/lib/mailer.ts`. `APP_URL`
determina il dominio del link. Se SMTP manca o fallisce, il messaggio dichiara
che l’email non è stata inviata e consente di copiare il link. I token non sono
scritti nei log. I collaudi usano indirizzi `.test` senza invii reali.

## Definizioni delle statistiche

Tutti gli importi sono centesimi interi in euro, con la base fiscale registrata
nel gestionale. Non si inventano IVA, costi, utile, fatture o scadenze di rate.
Le letture non scrivono addebiti, pagamenti o contratti e non cambiano le formule
di Economia.

| Indicatore | Definizione effettiva |
| --- | --- |
| Incassi netti | Pagamenti confermati alla data `paidAt`, meno rimborsi riusciti alla data `completatoAt` nel periodo. Acconto e saldo distinti; cauzioni riconoscibili escluse. Costi, IVA e commissioni non sottratti. |
| Da incassare | Per ogni permanenza non annullata presente nel periodo: `max(0, somma addebiti − incassi confermati netti dei rimborsi riusciti)`, come nel dettaglio Economia. Cauzioni escluse. Saldo attuale, non scadenze storiche. Crediti separati. |
| Occupazione posti | Tempo riservato / tempo disponibile dei soli posti e aree ancora presenti nel profilo. Un’uscita in mare conserva la riserva. Disponibilità e riserve sono mostrate come media giornaliera nel periodo; il dettaglio elenca i giorni equivalenti per singolo posto. |
| Contratti iniziati | Permanenze non annullate con decorrenza nel periodo. La firma del documento non determina il conteggio. |

Le quattro caselle aprono finestre in sola lettura con riepilogo, singole voci,
pagine di 20 righe e collegamenti alle schede barca. Incassi elenca pagamenti e
rimborsi con segno e data; Da incassare mostra addebiti, pagamenti, residui e
crediti; Occupazione elenca i singoli posti; Contratti iniziati le permanenze.
Le finestre si aggiornano insieme alla dashboard, gestiscono pagine rimaste
vuote, errori e risposte superate. Escape chiude e restituisce il focus.

Tolti dall’interfaccia «Valore dei servizi · stima» e «Valore medio contratto».
La precedente ripartizione temporale resta nel calcolo interno per compatibilità,
ma non è presentata come un incasso. «Resa per area» ora confronta incassi netti,
occupazione e numero medio di posti disponibili, senza stime di valore.
La tabella e il filtro area compaiono solo con più aree attive; con una sola
compare il nome dell’area rimasta, con nessuna uno stato esplicito.

Le aree archiviate e i posti con `rimossoAt` non contribuiscono più a filtri,
tabella o occupazione, anche selezionando un periodo passato. La capacità dei
posti ancora presenti parte dalla creazione e sottrae le indisponibilità
registrate; i blocchi anteriori all’introduzione dello storico restano indicativi.
Rimuovere un’area conserva contratti, pagamenti e conti: gli incassi storici
restano nel totale generale. Nella tabella sono attribuiti all’area assegnata
alla data del movimento; gli importi di aree rimosse o senza assegnazione sono
spiegati separatamente. Un’area di un’altra azienda resta 404; un filtro relativo
a un’area propria rimossa viene normalizzato e tolto dall’URL. Con una sola area
si elimina il filtro nascosto, evitando di limitare inconsapevolmente gli incassi.

La ciambella classifica con il saldo attuale le permanenze non annullate presenti
nel periodo. Segmenti e legenda aprono il dettaglio; gratuiti e sovrapagati sono
saldati. Nessuna compensazione tra clienti.

I grafici Andamento economico e Occupazione commerciale permettono di scegliere
Giorno/Settimana/Mese o l’aggregazione automatica. Hover e focus evidenziano
l’intervallo con valori; clic, tocco, Invio e Spazio aprono il dettaglio limitato
alle date effettive dell’intervallo, anche per settimane o mesi parziali.
Le frecce permettono di spostarsi tra gli intervalli da tastiera.

Le date selezionate includono l’intera data finale nell’intervallo
`[inizio giorno dal, inizio giorno dopo al)` in `Europe/Rome`. Ogni giorno civile
vale uno anche al cambio dell’ora. I confronti usano il precedente intervallo di
pari durata o le stesse date dell’anno precedente, adattando il 29 febbraio.
Senza capacità l’occupazione non è disponibile; movimenti senza data rendono il
totale degli incassi indisponibile e lasciano visibili soltanto quelli certi.

Le query restano sul server, circoscritte all’azienda, senza richieste per ogni
cliente o posto. La dashboard non trasferisce la composizione completa al
browser: `dettaglio=incassi|residui|occupazione|contratti` e `categoria` forniscono
pagine separate protette dal permesso importi. Intervallo massimo: 1096 giorni.
Aggiornamento al focus, ogni dieci secondi e con il pulsante Aggiorna.

## Condivisione e concorrenza

Le schermate si aggiornano al focus e ogni dieci secondi quando visibili. Dopo
una riconnessione ricaricano il dato autorevole; le scritture offline vengono
rifiutate. Le viste nuove proteggono dall’arrivo fuori ordine delle risposte.

Le risorse condivise hanno `revisione`. Le modifiche richiedono `If-Match` con
la revisione letta: controllo e scrittura avvengono sotto lock nella stessa
transazione. Una revisione superata produce 409 e, quando consentito, il nome
dell’autore dell’ultimo aggiornamento. Le bozze delle note e dei moduli restano
disponibili. La UI non ripete automaticamente un salvataggio in conflitto.

Creazione permanenza e registrazione movimento richiedono anche
`Idempotency-Key`: un retry identico restituisce la risposta già registrata;
riutilizzare la chiave per un contenuto diverso produce 409. Questi record
sono circoscritti a utente e azienda. La UI invia la chiave anche per le altre
creazioni, comprese attività e registrazioni economiche: i loro retry con la
stessa chiave restituiscono la prima risposta senza duplicare i record.
L’audit delle mutazioni viene scritto nella
stessa transazione, con campi pertinenti e senza credenziali o token.

Restano i vincoli PostgreSQL `EXCLUDE USING gist` su posto e barca. Gli intervalli
sono `[dal, al)`; `al = null` significa senza fine. Intervalli adiacenti sono
compatibili. Uno spostamento chiude e apre le assegnazioni atomicamente;
destinazioni indisponibili e conflitti non lasciano libera l’origine.

## Migrazioni e avvio locale

Migrazioni additive, dopo quelle già presenti per servizi e priorità:

1. `20261010170000_ormeggio_multiutenza_statistiche`: appartenenze, inviti,
   revisioni, indisponibilità e backfill degli utenti dalle relazioni esistenti.
2. `20261010180000_ormeggio_operazioni_condivise`: risposte idempotenti.
3. `20261010190000_ormeggio_capacita_storica`: conservazione dei posti rimossi,
   storia della capacità e ulteriori vincoli.
4. `20261010200000_ormeggio_capacita_relazioni`: allineamento delle relazioni.

Il backfill usa `User.tenantId` e il ruolo già registrato; non deduce titolari
dalle email. Conserva i permessi degli account esistenti e la compatibilità dei
flussi Noleggio. Le nuove persone invitate hanno accesso solo a Ormeggio.
Le migrazioni sono applicate e verificate soltanto in locale e su database
temporanei; nessun deploy di produzione fa parte di questo intervento.

```bash
docker compose up -d db redis
node --env-file=.env.local node_modules/prisma/build/index.js migrate deploy
node node_modules/prisma/build/index.js generate
npm run dev
```

Se lo sviluppo è già avviato, arrestarlo e riavviarlo dopo la generazione del
client Prisma. Prima di un futuro rilascio usare il normale flusso di backup e
deploy del repository, senza reset o sincronizzazioni distruttive dello schema.

## Verifica su due dispositivi

1. Sul dispositivo A entra come titolare, apri Collaboratori e invita un Addetto.
   Sul dispositivo B apri il link e accetta con il suo account personale.
2. Apri la mappa su entrambi. Su B sposta una barca e registra un’uscita: A deve
   vedere l’aggiornamento entro dieci secondi o tornando sulla scheda; il posto
   resta riservato. Scollega e ricollega B, poi verifica lo stato ricaricato.
3. Apri la stessa attività su A e B. Salva una nota su A, poi prova il salvataggio
   della bozza precedente su B: deve apparire il conflitto senza perdere la bozza.
   Sospendi B da Collaboratori: al successivo aggiornamento deve tornare al login.
4. Con l’Addetto apri la Vista TV: deve mostrare la mappa senza contatti e comandi
   di modifica. Economia e Statistiche restano escluse dal suo accesso.
   Un Responsabile accede alle statistiche solo dopo l’autorizzazione importi.

Il collaudo automatico usa un database vuoto temporaneo, applica tutte le
migrazioni e compila la build di produzione. `scripts/verifica-statistiche-multiutenza.mjs`
verifica formule, ruoli, inviti, revoche, tenant e richieste simultanee reali;
`scripts/verifica-ormeggio-browser.mjs` verifica navigazione, schermi piccoli,
vista TV e revoca durante una sessione aperta. Le verifiche del repository
coprono anche le regressioni Noleggio/Marketplace.

Esito finale: **1096 PASS, 0 FAIL** (768 verifiche di formule/API/regressioni e
328 verifiche Chrome). Typecheck: zero errori. Lint: zero errori, 255 warning.
Confini dei prodotti: nessuna violazione, con 115 operazioni private verificate.
Build di produzione completata e tutte le 63 migrazioni applicate su database
vuoto temporaneo, poi rimosso. Verificati nel browser due contesti indipendenti,
riconnessione, sospensione con pagina aperta, risposte lente dei filtri e
larghezze 1440/768/390 px. Schermate desktop/mobile/TV ispezionate. La procedura
su due dispositivi fisici sopra descritta resta una prova disponibile all’utente;
il collaudo automatico usa due sessioni indipendenti sullo stesso computer.

## File principali

- `prisma/schema.prisma` e le quattro migrazioni: appartenenze, inviti,
  revisioni, capacità e risposte idempotenti.
- `src/modules/piattaforma/accesso-azienda.ts`, `accesso-prodotti.ts` e
  `src/lib/identita.ts`: permessi effettivi dell’azienda attiva.
- `src/modules/piattaforma/collaboratori/operazioni.ts` e `Collaboratori.tsx`:
  inviti, appartenenze e selezione azienda.
- `src/modules/ormeggio/accesso.ts`: autorizzazioni specifiche dei profili.
- `src/modules/ormeggio/server/condivisione.ts`, `richiesta.ts` e `src/lib/db.ts`:
  transazioni, revisioni, retry, mascheramento delle risposte e audit.
- `src/modules/ormeggio/statistiche/calcoli.ts`, `server/statistiche/operazioni.ts`
  e `views/statistiche/page.tsx`: definizioni, letture e dashboard.
- `src/modules/ormeggio/components/OperazioniAddetto.tsx` e `MonitorOrmeggio.tsx`:
  interfacce operative e TV.

## Revisione dell’11 ottobre 2026

Dashboard semplificata, dettagli delle quattro caselle, grafici interattivi e
aree attive verificati con il collaudo isolato completo: **1150 PASS, 0 FAIL**
(802 API/regressioni, sei test unitari e 342 Chrome). Typecheck e lint senza
errori (254 warning storici), confini rispettati e build riuscita. Provati il
passaggio da due aree a una, il filtro di un’area rimossa e l’aggiornamento del
dettaglio occupazione già aperto; schermate ispezionate a 1440/768/390 px.
Tutti i dati automatici sono rimasti nel database temporaneo, poi rimosso.

### Collaudo della rimozione di Visualizzazione — 11 ottobre 2026

**1163 PASS, 0 FAIL** nel collaudo isolato completo: 812 API/regressioni, sei
unitari e 345 Chrome. Verificati selettori con i soli profili attuali, inviti e
assegnazioni rifiutati per il ruolo ritirato, vecchi inviti non accettabili senza
creare account, blocco della vecchia sessione, riassegnazione esplicita nel
pannello e vista TV Addetto. Typecheck, lint e confini senza errori (254 warning
storici del lint); build di produzione riuscita. Ambiente temporaneo rimosso.
