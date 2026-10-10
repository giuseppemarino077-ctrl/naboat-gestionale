# Ormeggio: utilizzo e revisione operativa

Analisi e intervento del 9 ottobre 2026. Il modulo è un gestionale interno: non è un marketplace di posti né una procedura di prenotazione pubblica. I collegamenti con token per firmare un contratto restano parte del servizio al proprietario.

## Tipi di struttura e percorsi d’uso

| Struttura | Attività quotidiana | Informazione prioritaria | Percorso nel gestionale |
|---|---|---|---|
| Pontile, marina, campo boe | Custodire barche, registrare uscite e rientri, preparare le uscite | Posto occupato, barca presente/in mare, lavori da fare | Quadro posti → scheda → uscita/rientro; Attività per la preparazione |
| Ormeggio stagionale/residenziale | Mantenere assegnazioni lunghe, gestire servizi e corrispettivi | Posto stabile, proprietario, periodo, contratto e saldo | Assegnazione con fine prevista o indeterminata → contratto → servizi → conto |
| Transito/soste brevi | Individuare un posto libero in una data, registrare ingresso e liberazione definitiva | Liberi nell’area, periodo corretto, pagamento | Data/area/stato nel quadro → assegnazione → conto → chiudi sosta |
| Rimessaggio a terra (rinviato) | Fuori dall’attuale perimetro operativo, su richiesta del titolare | Conservare solo la lettura dello storico preesistente | Non proponibile nelle nuove soste |
| Cantiere con servizi | Pianificare lavaggi, manutenzioni, carburante e lavori su barche custodite | Attività prevista, addetto, quantità/unità, stato e addebito | Catalogo → attività nella scheda → avvio/completamento → addebito unico → incasso |
| Struttura con acqua e terra | Trasferire barche tra pontili e piazzali mantenendo la storia | Area, coordinate e posizione storica | Aree distinte → trasferimento → storico; il tipo di custodia resta quello della permanenza |
| Azienda con noleggio e custodia | Separare flotta propria e barche dei proprietari | Modulo attivo e destinazione d’uso della barca | Selettore Noleggio/Ormeggio; conversione con conferma e controllo prenotazioni |
| Proprietario con più barche | Consultare contatti e conti aggregati, poi il singolo dettaglio | Contatto, barche collegate, residuo per permanenza | Proprietari → scheda; Economia → nome del proprietario → Conto della permanenza |

La griglia rappresenta coordinate gestionali, non una planimetria nautica con misure, fondali e compatibilità dimensionale. Il filtro “libero” mostra la situazione del giorno selezionato: non garantisce disponibilità sull’intero intervallo; l’API e i vincoli del database controllano il periodo quando si salva. Un trasferimento in giornata può comparire in più posizioni nello storico giornaliero, perché la vista copre tutto il giorno.

## Persone e permessi

- **Titolare:** organizza aree e catalogo, assegna addetti, controlla contratti e conti, gestisce il Team. Il permesso importi resta verificato sul server anche per le azioni dalla scheda.
- **Operatore con importi:** gestisce i flussi consentiti, registra servizi, addebiti e incassi; non acquisisce automaticamente i poteri del titolare sul Team.
- **Operatore senza importi:** consulta posti e proprietari, registra movimenti e attività prive di prezzo. I campi economici sono nascosti. Il completamento che genera un addebito resta riservato al personale autorizzato, come imposto dall’API esistente.
- **Skipper:** resta nel perimetro di sola consultazione previsto per il noleggio; non è stato abilitato alle operazioni di Ormeggio.
- **Proprietario cliente:** non accede al gestionale interno tramite questa revisione. Può ricevere il collegamento riservato del contratto e il contatto WhatsApp predisposto dall’operatore.
- **NaBoat:** abilita il modulo e gestisce la piattaforma. Il quadro operativo appartiene sempre all’azienda autenticata.

## Revisione delle sezioni

| Sezione | Problema rilevato | Intervento |
|---|---|---|
| Navigazione | Collegamento al sito pubblico anche durante la custodia; Quadro posti evidenziato insieme ad altre pagine | Collegamento presente solo nel modulo noleggio; voce attiva coerente; barra laterale ferma durante lo scorrimento |
| Quadro posti | Grande testata, contatori voluminosi e navigazione duplicata prima della griglia | Titolo compatto, riepilogo su righe brevi, strumenti raccolti; celle leggibili e griglia scorrevole con numeri fermi |
| Quadro posti | Ricerca senza stato; pannello sottraeva spazio già su tablet | Filtri di stato, giorno precedente/successivo/Oggi, conteggio risultati; pannello affiancato solo su schermi ampi |
| Quadro posti | Configurazione non bloccava il posto libero; elenco non permetteva l’assegnazione | Stesse azioni disponibili in griglia/elenco; messaggi di successo solo dopo risposta positiva |
| Assegnazione | Errori nascosti dietro la finestra e corrispettivo visibile agli addetti senza importi | Dialogo accessibile, errore nel modulo, invio protetto, data ereditata dal quadro, prezzo solo agli autorizzati |
| Attività | Azioni senza controllo risposta; nessun filtro per addetto/stato/ricerca | Errori espliciti, blocco durante salvataggio, ricerca, stato, lavori assegnati a me, scadenze evidenziate e collegamento diretto ai lavori |
| Movimenti | Elenco statico, ricerca assente | Aggiornamento al focus e periodico, filtro giorno/tipo/ricerca, posto indicato come attuale per non confonderlo con lo storico |
| Proprietari | Modulo creazione sempre davanti ai contatti; barche senza collegamenti | Creazione su richiesta, contatti prioritari, collegamenti alla permanenza attiva o più recente e indicazione dello storico |
| Economia | Riepiloghi ingombranti; elenco non aggiornato; ricerca assente | Totali compatti, ricerca per proprietario/barca/contatto, filtro residui, dettaglio collegato al Conto, aggiornamento periodico |
| Configurazione | Aree e catalogo mescolati; creazione area sempre aperta | Due sezioni distinte, creazione area richiudibile, griglie larghe, notifiche alle altre viste |
| Scheda | Molti comandi allo stesso livello, modifiche tipo/modello sovrapposte, addetti caricati ma non selezionabili | Azioni quotidiane in testa e gestione/documenti in sezione espandibile; salvataggio esplicito barca, scelta addetto per titolare, catalogo compila unità e prezzo |
| Scheda | Prezzo nullo inviato anche senza permesso; riapertura di attività contabilizzata sempre rifiutata | Prezzo omesso per addetti senza importi; storno con conferma esplicita e rispetto del blocco sugli addebiti pagati |
| Scheda | Messaggio WhatsApp dichiarava sempre la barca pronta | Testo iniziale coerente con lo stato “Pronta”, modificabile prima dell’apertura di WhatsApp |
| Sito pubblico | Profilo azienda poteva includere un tenant di solo Ormeggio | Filtro unico per aziende noleggio/miste applicato a profili, catalogo e sitemap; le barche in custodia restano escluse |

## Collegamenti e conseguenze

Ogni modifica riuscita nella scheda segnala il cambiamento alle viste Ormeggio. Quadro, attività, movimenti, proprietari e conti si riallineano al focus o periodicamente; i moduli aperti conservano le bozze. La firma resta immutabile e il tipo/modello aggiornato viene usato nei nuovi documenti. Uscire in mare non libera il posto. “Pronta” resta una conferma dell’addetto, indipendente dal rientro. Completamento, storno e incasso usano le API esistenti; non sono stati sostituiti da aggiornamenti solo visivi.

## Limiti e prossime evoluzioni

Questi sono limiti analizzati, non nuove funzionalità promesse dall’intervento:

1. **Capacità e sicurezza fisica:** mancano lunghezza/larghezza massima del posto, pescaggio, fondale, potenza elettrica e compatibilità automatica. La griglia non può suggerire un posto fisicamente idoneo.
2. **Acqua/terra:** le aree non hanno una tipologia fisica vincolante. Trasferire il posto non converte automaticamente la natura del contratto; una conversione deve definire corrispettivo, periodo e revisione contrattuale.
3. **Transito avanzato:** non ci sono preventivi automatici per notte, metro, stagione e consumi; il corrispettivo concordato rimane una voce esplicita, non un canone ricorrente automatico.
4. **Movimenti:** uscita/rientro sono registrazioni; le API non impongono ancora una macchina a stati completa contro uscite duplicate o rientri senza uscita. Gru/varo/alaggio e uscite programmate non costituiscono un’agenda risorse.
5. **Storico e grandi impianti:** gli elenchi hanno limiti (50 proprietari, 200 attività, 300 movimenti); la UI li dichiara. Servono paginazione e ricerca server per volumi superiori. Le righe oltre Z richiedono una convenzione e migrazione coordinate dedicata.
6. **Consistenza temporale:** griglia storica giornaliera con stato lavori/conti corrente; non è una ricostruzione contabile completa a un istante. Una vista oraria va progettata separatamente.
7. **Verbali:** le API e i verbali check-in/check-out esistono, ma manca una schermata guidata completa con fotografie e danni nella scheda Ormeggio.
8. **Portale proprietario e pagamenti online Ormeggio:** da progettare; non basta esporre il quadro interno. Servono credenziali/permessi dedicati, notifiche, policy e collegamento agli incassi.
9. **Audit e rettifiche:** non equivale a un software fiscale; storno addebito già pagato e rimborsi richiedono un flusso economico esplicito.

## Collaudo

### Riepilogo del quadro posti

Il riepilogo del quadro usa schede stondate nei colori deep, ocean e signature,
con icone, numeri e un comando esplicito “Da sistemare”. Il dialogo elenca tutti
i posti gialli nella data scelta, anche nelle altre aree: lavori con nome e stato,
contratto da generare/firmare e conto da saldare. Ogni categoria rimanda alla
sezione corretta della permanenza; il collegamento contratto apre anche i comandi
documentali. “Mostra nel quadro” seleziona area e barca e azzera i filtri di ricerca.
Anche le attività in corso mantengono la segnalazione finché non sono completate.
Conti e azioni contrattuali restano riservati agli utenti con permesso importi.
Il conteggio riguarda posti; le barche bloccate restano una categoria separata.

Collaudo del riepilogo: **494 PASS, 0 FAIL**, inclusi 29 controlli Chrome.
Verificati nomi dei lavori nel dialogo, collegamenti a lavori/conto/documenti,
apertura dei comandi contrattuali e protezione degli importi per gli addetti.
Build riuscita, typecheck e lint senza errori (254 warning). Sul telefono
390×844 la griglia inizia a 421px, con scorrimento confinato al quadro.

### Correzione della digitazione nei dialoghi

Il componente condiviso `Dialogo` rieseguiva la gestione del focus a ogni cambio
della callback `onChiudi`, ricreata durante la digitazione nei moduli controllati.
Il focus iniziale e il blocco dello scorrimento ora dipendono solo dall’apertura
del dialogo; Escape usa la callback aggiornata tramite ref. Un autofocus già
presente nel modulo viene rispettato. La correzione riguarda tutti gli utilizzatori
del componente, inclusi assegnazione, moduli generici e conferme.
Il test Chrome digita carattere per carattere, controlla il focus dopo ogni lettera,
verifica posizione del cursore dopo aggiornamento utente, Tab/Escape e salvataggio
di nuovo proprietario, telefono e barca. Comprende tipo/modello con suggerimenti,
note e textarea del modulo messaggio, annullato senza aprire WhatsApp.

Esito: **504 PASS, 0 FAIL**, inclusi 39 controlli Chrome. Build riuscita,
typecheck e lint senza errori (254 warning). Server locale mantenuto attivo.

### Esito della revisione operativa iniziale

Esito finale: **490 PASS, 0 FAIL** (386 smoke generale, 38 Ormeggio, 19 Oggi,
22 regressioni di stabilizzazione, 25 controlli Chrome). Build di produzione
riuscita; typecheck 0 errori; lint 0 errori e 254 warning. Verificati nel browser
anche avvio/completamento/storno con riallineamento degli addebiti, creazione
attività senza importi, collegamenti fra sezioni e dialoghi da tastiera.
Su viewport mobile 390×844 la griglia inizia entro metà schermo e la pagina non
scorre orizzontalmente: lo scorrimento resta confinato alla griglia.
Database, server e profilo Chrome temporanei rimossi. Nessun deploy eseguito.

I test browser usano un’azienda temporanea e non aprono sessioni o dati reali. Comando: `ORMEGGIO_BROWSER=1 npm run test:isolated` (Node.js 22 o successivo e Chrome installato; `CHROME_BIN` per indicare l’eseguibile). Le schermate possono essere salvate fuori dal repository con `ORMEGGIO_SCREENSHOTS_DIR`. Senza il flag browser il collaudo resta compatibile con la CI Node.js 20.

### Quadro posti: trascinamento e griglia adattiva

La prima versione dedicava l’80% superiore alla sagoma e il 20% inferiore ai
nomi; questa proporzione è superata dalla revisione di leggibilità sotto. La griglia usa colonne
proporzionali allo spazio disponibile, anche quando si apre la scheda laterale:
non richiede scorrimento orizzontale. Le dimensioni si ricalcolano al cambio di
area, configurazione e finestra. Nelle griglie dense, passaggio del cursore e
focus aprono un’anteprima ingrandita per leggere i nomi completi.

Il trascinamento usa Pointer Events, soglia iniziale per distinguere il clic,
anteprima sollevata, destinazione evidenziata e animazione di arrivo o ritorno.
Esc annulla. Una barca può uscire anche da un posto bloccato; non può essere
trascinata verso un posto bloccato. È operativo sulla data di oggi; per altre date resta disponibile
il comando Sposta con decorrenza esplicita. La scheda e i comandi da tastiera
restano accessibili senza trascinamento. Le animazioni rispettano la preferenza
per il movimento ridotto.

Il salvataggio passa dall’API di trasferimento esistente: controlla permessi,
tenant, posto bloccato e sovrapposizioni nell’intero intervallo, incluse quelle
future. Aggiorna assegnazioni, movimento e audit nella stessa transazione;
conto, attività, contratto e proprietario restano collegati alla permanenza.
La griglia di oggi legge la posizione all’istante corrente, evitando di mostrare
la stessa barca nel vecchio e nel nuovo posto dopo un trasferimento. Le altre
date mantengono la ricostruzione giornaliera dalle assegnazioni storiche.

La riduzione delle dimensioni è consentita anche con assegnazioni o storico,
come descritto nella revisione «Rimozione e riduzione delle griglie» più sotto.
I posti rimossi non rientrano nei contatori del quadro; le barche interessate
restano accessibili separatamente.

Collaudo finale: **518 PASS, 0 FAIL** (386 generale, 38 Ormeggio, 19 Oggi,
22 stabilizzazione, 53 Chrome). Typecheck e lint: 0 errori, 254 warning storici.
Build di produzione riuscita. Verificati trascinamento con eventi mouse reali,
rapporto 80/20, posto precedente libero, storico/movimento/conto, rifiuto di
posti bloccati/occupati e conflitti futuri, Escape, 40 colonne su desktop e
telefono, anteprima al focus e riduzione coerente delle dimensioni. I controlli
Chrome attivano esplicitamente la scheda prima di verificare il focus.

### Configurazione dell’area corrente e aggiornamento del quadro

«Configura posti» apre nel quadro il modulo dell’area selezionata, precompilato
con nome, righe e colonne reali. «Salva griglia» modifica solo quell’area tramite
l’API esistente e ricarica griglia e contatori. Il cambio area aggiorna il modulo;
la creazione di una nuova area resta disponibile in un dettaglio secondario e
seleziona l’area appena creata. I clic sui posti continuano a salvare subito
blocco/riabilitazione. Entrare in configurazione apre la vista Griglia, chiude la
scheda barca e azzera i filtri per mostrare tutti i posti da configurare.

Il pulsante «Aggiorna» nella barra è rimosso: ripeteva la lettura già eseguita
dopo le operazioni, al ritorno sulla scheda e ogni 10 secondi. In caso di errore
nel caricamento compare «Riprova», che ripete la lettura e sparisce al recupero.
Gli aggiornamenti automatici sono sospesi durante la configurazione per
preservare i campi in modifica; riprendono all’uscita, con una lettura immediata.

Esito: **527 PASS, 0 FAIL**, inclusi 62 controlli Chrome. Verificati apertura
dell’area corrente anche dalla vista Elenco, conservazione dei campi, modifica
isolata di nome/dimensioni, cambio area, blocco/riabilitazione, rilettura al focus
e recupero da interruzione di rete tramite Riprova. Typecheck e lint senza errori
(254 warning storici), build di produzione riuscita.

### Rimozione e riduzione delle griglie

Su richiesta del proprietario, lo storico non impedisce più la riduzione o la
rimozione di una griglia. La riduzione elimina i posti fuori dalle nuove
dimensioni solo se mai utilizzati; quelli collegati a soste o assegnazioni
restano come riferimenti storici, esclusi da griglia, contatori e selettori.
Un successivo ampliamento recupera le coordinate conservate, senza duplicarle.

DELETE dell’area imposta `Area.archiviata`: l’area scompare dal quadro e dalla
configurazione, mentre barche, soste, attività, incassi, contratti e PDF
continuano a funzionare. La migrazione `20261009123402_ormeggio_aree_rimosse_storico`
aggiunge soltanto il booleano, inizialmente false; applicata al DB locale e
client/server rigenerati e riavviati. Nessuna griglia reale rimossa dal collaudo.

Il quadro mostra «Barche fuori griglia» per le assegnazioni dei posti rimossi
nella data selezionata. Ogni voce apre la scheda, che segnala il posto rimosso
e offre direttamente Sposta barca. Il trasferimento mantiene conto e contratto
e registra normalmente il cambio di posizione. Non chiudiamo automaticamente
soste né cancelliamo documenti o registrazioni economiche. I posti rimossi
rifiutano nuove assegnazioni; lock sull’area coordinano rimozione/riduzione e
creazione/trasferimento concorrenti. Permessi e isolamento tenant invariati.

Collaudo finale: **546 PASS, 0 FAIL**, inclusi 47 controlli API Ormeggio e 72
Chrome. Typecheck e lint senza errori (254 warning storici), build riuscita.
Verificati anche contratto firmato e incassi dopo la rimozione, espansione con
recupero delle coordinate, blocco di nuove soste sui posti rimossi e trasferimento
reale da area eliminata a un posto attivo.

### Nomi leggibili, legenda e rimessaggio rinviato (revisione intermedia)

La proporzione fissa 80/20 rendeva i nomi troppo piccoli. Le celle di almeno
80px ora usano caratteri da 12–14px, nomi a capo senza ellissi e spazio automatico
per l’anagrafica. Le righe occupate ricevono spazio in base al testo; quelle
vuote cedono spazio. Se il testo richiede più altezza, cresce la pagina, senza
una barra di scorrimento interna o orizzontale nel quadro. La sagoma rimane
riconoscibile nella parte superiore e il trascinamento resta disponibile.

Sotto 80px di larghezza per cella, la panoramica resta completa e ogni posto
occupato ha una scheda leggibile con coordinata, proprietario e barca sotto la
mappa, collegata alla stessa selezione. Non si mostrano nomi da 2–5px né si
richiede il passaggio del cursore per consultarli; resta anche l’ingrandimento.

`in_sosta` è lo stato automatico senza attività aperte/uscita: nell’interfaccia
si chiama «Al posto». `bloccata` viene da Boat.stato manutenzione/non_disponibile:
è mantenuto come segnalazione reale, rinominato «Non disponibile». Il colore
compare nella legenda solo se l’area contiene una barca in quello stato. È
distinto dal posto non utilizzabile. Le descrizioni nella legenda chiariscono
che si tratta di stati automatici, non di pulsanti per cambiare stato.

Il rimessaggio è rinviato: rimosso dal modulo di nuova sosta e dalla presentazione
in registrazione; POST permanenze accetta soltanto ormeggio_custodia (422 per
rimessaggio, senza scritture). L’enum e la lettura dei dati precedenti restano
compatibili: documenti, incassi e storico esistenti conservano il tipo originale.
Nessuna migrazione o conversione automatica di soste pregresse.

Collaudo: **551 PASS, 0 FAIL** (386 generale, 50 API Ormeggio, 19 Oggi, 22
stabilizzazione, 74 Chrome). Verificati caratteri minimi, nomi completi senza
ellissi o taglio verticale, schede leggibili nelle griglie dense, trascinamento,
assenza del rimessaggio nel modulo e rifiuto API senza creazioni parziali.
Verificata anche l’origine reale degli stati al posto e manutenzione. Typecheck,
lint e build riusciti (254 warning storici). Schermate controllate su desktop e
telefono. Nessuna migrazione richiesta.


### Revisione corrente: celle uniformi, proprietari, economia e servizi

La richiesta successiva ripristina le celle tutte uguali, con dimensioni adattate
allo spazio disponibile. L’anteprima in rilievo è disponibile su ogni barca al
passaggio del mouse o al focus, anche nelle celle grandi; sul telefono il tocco
apre la scheda. Rimane il trascinamento, con controlli sui conflitti e storico.
Il piè di cella riserva spazio uniforme alle due righe di testo, con ellissi
orizzontali per i nomi lunghi; l’anteprima mostra i nomi interi. Nelle griglie
molto dense resta la panoramica con sagome, senza schede aggiuntive sotto la mappa.
Questo comportamento sostituisce le righe ad altezza variabile della revisione
intermedia descritta sopra.

Il nome in Proprietari apre una scheda per modificare nome, telefono, email e
note. PATCH normalizza i recapiti, aggiorna la chiave di riuso e rifiuta i
contatti duplicati (409), senza fusioni automatiche. L’anagrafica è unica e
condivisa da griglia, soste ed economia.

L’eliminazione richiede conferma nella scheda. DELETE archivia il proprietario e
le sue barche in custodia, chiude le soste attive, tronca le assegnazioni correnti
ed elimina quelle future; libera quindi i posti anche nei giorni successivi.
Rimuove i movimenti futuri non effettuati. Attività e movimenti delle barche
rimosse sono esclusi dalle liste operative; non si possono creare nuove attività,
movimenti o assegnazioni, né completare attività sospese generando nuovi addebiti.
I contratti, gli addebiti, gli incassi e lo storico precedente restano disponibili
in Economia, con indicazione «eliminato · storico». Non si effettuano rimborsi,
storni o ricalcoli automatici. Il conto può ancora essere gestito esplicitamente.
Lock sul proprietario serializzano eliminazione, nuove assegnazioni e spostamenti.

Il nome in Economia apre il riepilogo del proprietario e le sue soste, distinte
per barca e data. Ogni sosta apre direttamente Conto: addebiti, incassi manuali,
rettifiche, storni e riepilogo PDF usano le API già esistenti e il permesso importi.

Il catalogo contiene 58 servizi predefiniti: periodi di ormeggio, assistenza,
guardiania, acqua/energia, rifornimento, pulizia, controlli, manutenzione,
sicurezza e servizi alle persone. Nome, prezzo e unità sono modificabili; si
possono aggiungere ed eliminare voci. Ricerca nel catalogo. Prezzi iniziali null
(da definire): nessun prezzo inventato e nessun addebito automatico. L’inizializzazione
è un POST autenticato, una sola volta per tenant, con lock e senza duplicare nomi
esistenti; avviene entrando in Configurazione o nella scheda della sosta. Le voci
eliminate non ricompaiono ai successivi accessi. Le attività già registrate
conservano nome, prezzo e unità acquisiti. PATCH non rivela prezzi nella risposta
quando l’utente può cambiare il nome ma non vedere gli importi.

Marca/modello rimossi dai moduli, dalla scheda del quadro, dai nuovi contratti e
dai riepiloghi Ormeggio: restano nome e tipologia, entrambi modificabili nella
scheda barca. Le strutture condivise del noleggio e gli snapshot legali già
firmati rimangono compatibili.

Migrazione locale applicata: `20261009144649_ormeggio_proprietari_catalogo`
(`Proprietario.archiviato`, `Tenant.catalogoOrmeggioInizializzato`). Prisma
rigenerato e server di sviluppo riavviato. Nessun proprietario o barca reale
eliminato durante il collaudo: i test usano database e tenant temporanei.


Collaudo finale della revisione corrente: **571 PASS, 0 FAIL** (386 generale,
50 API Ormeggio, 19 Oggi, 22 stabilizzazione, 94 Chrome). Typecheck e lint senza
errori (248 warning presenti), build di produzione riuscita. Verificati mouse
reale, celle uniformi e piè di cella senza taglio verticale, trascinamento,
modifica recapiti e duplicati, accesso ai conti dal nome, modifica prezzi/unità,
inizializzazione idempotente e prezzi riservati, isolamento tra tenant,
eliminazione con barca futura, conservazione di contratto e incasso reali,
sospensione delle attività e conto storico ancora gestibile. Schermate desktop
e telefono controllate. Test esclusivamente su database temporanei.

### Disponibilità e riutilizzo dei posti (9 ottobre 2026)

Corretto il falso conflitto dopo una chiusura, uno spostamento o l’eliminazione
di un proprietario nella giornata corrente. Il quadro mostrava il posto libero
all’istante attuale, mentre il nuovo inserimento con la sola data di oggi partiva
da mezzanotte, sovrapponendosi allo storico. Ora una nuova sosta con inizio oggi
parte dal salvataggio; il modulo lo indica. Gli orari ISO espliciti conservano
la possibilità di registrare lo storico, rispettando i conflitti reali.

I controlli di posto e barca, anche nei trasferimenti, usano intervalli con fine
esclusa, coerenti con i vincoli del database: la fine di una sosta può coincidere
con l’inizio della successiva. Nessuna fine equivale a un’assegnazione illimitata,
che deve essere compatibile anche con gli impegni futuri. Gli errori indicano
coordinate e periodo occupato; dopo un conflitto il quadro viene aggiornato
senza cancellare i dati del modulo.

Quadro ed elenco usano lo stesso giorno in Europe/Rome, compresi i cambi d’ora.
Date inesistenti, orari senza fuso e periodi invertiti vengono rifiutati. Una fine
precedente all’ultimo spostamento restituisce 422 e non altera né la sosta né
il conto. Le date senza orario diverse da oggi mantengono la convenzione UTC
esistente; nessuna riscrittura dello storico o migrazione.

Regressioni dedicate in `scripts/verifica-disponibilita-ormeggio.mjs`, integrate
nel collaudo isolato, e prove browser del riuso dopo chiusura e trasferimento.
Verificati anche concorrenza, periodi adiacenti, sovrapposizione di un millisecondo,
impegni futuri, eliminazione proprietario e rollback senza dati parziali.

Collaudo di questa correzione: **693 PASS, 0 FAIL** (386 generale, 50 API Ormeggio,
19 Oggi, 22 stabilizzazione, 79 separazione, 29 disponibilità, 108 Chrome).
Typecheck, lint e confini riusciti; build di produzione riuscita. Restano i 248
warning preesistenti. Database temporaneo eliminato e localhost raggiungibile.

### Accesso alle attività dal menu (9 ottobre 2026)

La voce «Attività» della navigazione Ormeggio apre `/gestionale/ormeggio/da-fare`.
In cima alla pagina si sceglie il cliente, cercandolo anche per telefono o email,
poi una delle sue barche in custodia. Se la barca ha più soste, viene proposta
quella corrente; in sua assenza la prossima futura o l’ultima registrata. Il
periodo resta selezionabile esplicitamente, con date, stato e posto visibili.

«Apri attività» porta alla scheda esistente, già sul tab Attività.
«Nuova attività» apre anche il modulo di inserimento. Catalogo, addetti, stato
del lavoro, addebiti, storni e permessi usano gli stessi flussi del quadro posti.
Dalla scheda si torna all’elenco con «Tutte le attività». Il nome del cliente è
visibile e ricercabile anche nell’elenco dei lavori in sospeso.

Cambiare cliente azzera barca e periodo. Una barca senza sosta non permette
l’apertura di un’attività e rimanda al quadro posti. Clienti eliminati e barche
archiviate o a noleggio sono esclusi. La lettura dedicata del cliente è protetta
dal modulo e dal tenant, restituisce soltanto dati operativi senza importi.
Ricerche ritardate e richieste annullate evitano risultati di un cliente precedente;
gli aggiornamenti in background rispettano la compilazione dei campi.

Suite dedicata `scripts/verifica-accesso-attivita.mjs` nel collaudo isolato e
regressioni browser su selezione, cambio cliente, periodi multipli, inserimento,
addebito, ricerca, permessi e telefono. Nessuna migrazione.

Collaudo finale di questo intervento: **724 PASS, 0 FAIL** (386 generale,
50 API Ormeggio, 19 Oggi, 22 stabilizzazione, 79 separazione, 29 disponibilità,
17 accesso attività, 122 Chrome). Typecheck, lint e confini riusciti; build
di produzione riuscita. Restano 248 warning preesistenti. Schermate desktop e
telefono controllate; otto verifiche browser di localhost in sola lettura riuscite.
Database temporaneo eliminato; nessuna scrittura sui dati operativi.

### Catalogo a tendina nella pagina Attività (9 ottobre 2026)

In Attività è disponibile il menu «Catalogo attività», con tutte le voci offerte
e, per il personale autorizzato, prezzo e unità. «Nuovo servizio» aggiunge una
voce; «Modifica servizio» permette di cambiare nome, prezzo e unità di quella
selezionata. Prezzo vuoto significa da definire; zero è un prezzo valido. Sono
rifiutati importi negativi, ambigui o con più di due decimali.

`CatalogoServizi` è il componente unico di modifica anche per Configurazione,
dove restano elenco, ricerca ed eliminazione. `useCatalogoServizi` condivide
inizializzazione, lettura, aggiornamento e gestione degli errori tra Attività,
Configurazione e scheda della sosta. Le API e il catalogo nel database sono gli
stessi. Le modifiche si propagano nelle pagine aperte senza ricaricare o alterare
le bozze; la nuova selezione di un servizio propone nome, prezzo e unità attuali.

Attività e addebiti già salvati conservano i propri valori. Le modifiche del
catalogo non generano addebiti né ricalcoli dello storico. Chi non può vedere
gli importi può modificare nome e unità senza leggere o sovrascrivere il prezzo;
le protezioni server esistenti restano applicate. Nessuna migrazione.

Collaudo finale: **739 PASS, 0 FAIL** (386 generale, 50 API Ormeggio, 19 Oggi,
22 stabilizzazione, 79 separazione, 29 disponibilità, 17 accesso attività,
137 Chrome). Typecheck e lint senza errori (248 warning preesistenti), confini
e build riusciti. Verificati creazione e modifica da Attività, sincronizzazione
bidirezionale con Configurazione, valori nella scheda già aperta, conservazione
di bozze e attività salvate, prezzi non validi, permessi e telefono. Otto prove
browser di localhost in sola lettura riuscite; database temporaneo eliminato.

### Gestione rapida ed eliminazione servizi (9 ottobre 2026)

In Attività il catalogo ha ricerca immediata per nome o unità, tendina filtrata
con conteggio e «Elimina servizio» sulla voce selezionata. «Mostra elenco» apre
le righe con Modifica ed Elimina, senza cambiare pagina; la ricerca filtra anche
queste righe. Cambiare ricerca azzera la selezione, evitando eliminazioni su una
voce non più visibile. Dopo un salvataggio il filtro si azzera per mostrare la
voce aggiornata. Modificare un servizio non cancella la bozza Nuovo servizio.

La conferma indica il nome esatto; annullare conserva catalogo e selezione.
Durante il salvataggio i comandi sono disabilitati. L’esito aggiorna tendina,
elenco e contatore; una voce già eliminata da un altro operatore viene rimossa
anche dalla vista corrente. La DELETE è un’unica operazione filtrata per tenant:
due eliminazioni simultanee non producono errori interni.

Eliminazione condivisa con Configurazione e suggerimenti della scheda barca;
attività, addebiti e storico già registrati restano intatti. Nessuna migrazione,
eliminazione automatica o scrittura di collaudo sui dati operativi.

Collaudo finale: **753 PASS, 0 FAIL** (386 generale, 50 API Ormeggio, 19 Oggi,
22 stabilizzazione, 79 separazione, 29 disponibilità, 19 accesso attività,
149 Chrome). Typecheck, lint, confini e build riusciti; 248 warning preesistenti.
Verificati annullamento, rimozione da tendina e riga, ricerca e contatori,
conservazione esatta di attività/addebito contabilizzati, doppia eliminazione,
isolamento tenant e disposizione sul telefono. Otto prove browser di localhost
in sola lettura riuscite; database temporaneo eliminato.

### Campo unico per i servizi offerti (9 ottobre 2026)

In Attività, «Servizi e attività offerte» usa un solo campo per ricerca e
selezione, al posto di ricerca e menu separati. Cliccando nel campo vuoto si
vedono tutte le voci; digitando compaiono sotto i servizi il cui nome inizia
con quelle lettere, senza distinzione tra maiuscole, minuscole e accenti.
Ogni suggerimento mostra nome, unità e prezzo quando consentito, con Modifica
ed Elimina direttamente sulla riga. Restano Nuovo servizio e i comandi della
voce selezionata. Azzera ricerca mostra nuovamente tutto il catalogo.

Freccia giù porta al primo suggerimento, Invio sceglie la voce ed Esc chiude
l’elenco tornando al campo. Le azioni sono raggiungibili anche con Tab.
I suggerimenti si chiudono uscendo dal campo e dai suoi comandi; sul telefono
le righe adattano testo e pulsanti alla larghezza disponibile.
Catalogo condiviso, conferme, permessi e conservazione dello storico invariati.
La ricerca della pagina Configurazione continua a cercare anche nell’unità.

Collaudo finale: **760 PASS, 0 FAIL**, inclusi 156 Chrome. Typecheck e lint
senza errori (248 warning preesistenti), confini e build riusciti. Verificati
campo unico, ricerca per iniziali, tastiera, gestione dalle righe, creazione,
modifica, eliminazione e propagazione alle altre pagine; storico preservato.
Schermate desktop e telefono controllate. Undici verifiche browser di localhost
riuscite in sola lettura; database temporaneo rimosso, dati operativi invariati.

### Scheda del posto e motivo del giallo (10 ottobre 2026)

Selezionando una barca nel quadro, la scheda mostra subito un riquadro giallo
in rilievo con tutte le attività da fare o in corso, comprese quelle future.
Ogni lavoro riporta nome, stato, data prevista (Oggi/Domani/In ritardo quando
applicabile), eventuale addetto e accesso alla relativa riga nella scheda completa.
Le attività concluse restano nello storico e non compaiono nell’avviso.

Il riquadro usa le stesse attività aperte che determinano il colore della barca:
la risposta della griglia ora include id, nome, stato, data e nome dell’addetto,
senza importi. È visibile anche prima del caricamento dei dettagli della sosta,
rimane presente cambiando scheda e si aggiorna al completamento dei lavori.

Nuovo componente `SchedaPosto`, condiviso tra pannello desktop e finestra sul
telefono: intestazione NaBoat con nomi completi e coordinate; permanenza, contratto,
conto e contatti separati; note espandibili, chiamata/WhatsApp, accesso diretto a
Nuova attività e scheda completa. Trasferimento conservato. Permessi economici
invariati. Errori della scheda con Riprova locale, richieste obsolete annullate;
selezionare un’altra barca non riutilizza i dettagli della precedente.
Nessuna migrazione, modifica delle regole contabili o dei dati operativi.

Collaudo finale: **777 PASS, 0 FAIL**, inclusi 173 Chrome. Typecheck e lint
senza errori (244 warning storici), confini e build riusciti. Verificati avviso
immediato, date, navigazione al lavoro, aggiornamento dopo completamento,
permessi, errori/Riprova, cambio barca e telefono. Schermate desktop e telefono
controllate; quattro verifiche browser di localhost in sola lettura riuscite.
Database temporaneo rimosso, dati operativi invariati.

### Costo mensile della sosta in Economia (10 ottobre 2026)

Sotto il riepilogo di Economia un riquadro compatto chiede quanto costa un mese
di sosta per una barca. Campo in euro, pulsante Salva costo, conferma e validazione
di due decimali; zero indica una tariffa gratuita. Il valore aggiorna il prezzo
del servizio mensile nel catalogo condiviso ed è proposto scegliendo quel servizio
nelle nuove attività delle barche. Non genera addebiti ricorrenti automaticamente
e non modifica gli importi già concordati nelle soste.

Il servizio è riconosciuto anche dopo una rinomina, tramite l’unità «mese»;
se sono presenti più servizi mensili si può scegliere quale tariffa modificare.
Se nessuno è presente, Salva costo crea «Ormeggio mensile». Modifiche del catalogo
si riflettono nel riquadro; le bozze in compilazione resistono agli aggiornamenti
periodici. I profili senza permesso importi non vedono il riquadro, quelli di
sola consultazione non possono salvare. Stesse API e guardie del catalogo,
nessuna migrazione.

Collaudo finale: **788 PASS, 0 FAIL**, inclusi 184 Chrome e 11 nuove verifiche
del costo mensile. Typecheck e lint senza errori (244 warning storici), confini
e build riusciti. Schermate desktop e telefono controllate; persistenza,
tariffa gratuita, decimali, bozze, rinomina, prezzo nelle nuove attività e
permessi verificati. Database temporaneo rimosso, dati operativi invariati.

### Tariffe essenziali e prezzo della sosta (10 ottobre 2026)

Economia ora mostra due barre separate «TARIFFA GIORNALIERA» e «TARIFFA MENSILE»,
con il solo campo importo. Salvano all’uscita dal campo o con Invio; icona di
conferma, stato accessibile ed errori locali. Entrambe aggiornano le rispettive
voci del catalogo; zero è gratuito, campo vuoto significa tariffa da definire.
Rimosso il precedente riquadro descrittivo e il pulsante Salva costo.

Il corrispettivo della nuova sosta è proposto dalla tariffa mensile. La proposta
attende il catalogo e resta modificabile: digitazione, aggiornamenti periodici
e cambi del listino non sovrascrivono la compilazione in corso. Ogni nuova
compilazione riparte dal listino corrente; gli addetti senza importi non vedono
il prezzo e non ricevono un addebito automatico.

Nella scheda completa il corrispettivo è modificabile con Salva prezzo.
Il conto registra la differenza come rettifica, preservando incassi, servizi
e documenti già generati. Per aggiornare un contratto non firmato si usa il
comando Contratto; quelli firmati conservano la versione acquisita. Le rettifiche
simultanee vengono serializzate e non duplicano l’addebito. Una modifica del
solo prezzo non riscrive la fine prevista. La tariffa mensile è la proposta
iniziale del corrispettivo: non sono introdotti canoni ricorrenti automatici
né calcoli proporzionali alla durata. Nessuna migrazione.

Collaudo finale: **799 PASS, 0 FAIL**, inclusi 192 Chrome e 32 verifiche di
disponibilità/concorrenza. Typecheck e lint senza errori (244 warning storici),
confini e build riusciti. Verificati salvataggio su blur/Invio, tariffe separate,
precompilazione, prezzo personalizzato, nuova compilazione pulita, rettifica
dalla scheda, aggiornamento del conto e permessi. Schermate desktop e telefono
controllate; localhost risponde HTTP 200. Database temporaneo rimosso, prezzi
e dati operativi invariati durante il collaudo.

### Suggerimento del prezzo in base al periodo (10 ottobre 2026)

Nella nuova sosta il prezzo viene suggerito dopo la scelta di inizio e fine,
contando entrambi i giorni. Dal giorno 1 al 10 sono dieci tariffe giornaliere;
1–31 gennaio vale una tariffa mensile; 1 gennaio–1 febbraio vale una mensilità
più una giornata. Per periodi più lunghi si sommano i mesi di calendario e i
giorni rimanenti. Un mese iniziato il 15 termina il 14 del mese successivo;
per partenze a fine mese si adatta l’anniversario all’ultimo giorno disponibile.
Febbraio, anni bisestili e cambi di ora non alterano il conteggio.

Il riepilogo sotto il campo distingue mesi, giorni e rispettive tariffe.
Cambiando le date il suggerimento si aggiorna; un prezzo digitato a mano resta
preservato. «Usa prezzo suggerito» permette di tornare al calcolo automatico.
Il prezzo concordato resta modificabile anche dalla scheda completa, con
rettifica del conto. Se manca una tariffa necessaria il modulo invita a
configurarla in Economia o inserire un prezzo manuale. Nessuna proposta prima
di scegliere entrambe le date; una sosta senza fine può mantenere un prezzo
manuale o ancora da definire.

Il posto resta assegnato anche nell’ultimo giorno selezionato, incluso nel
prezzo; ammessa una sosta con inizio e fine nella stessa data. Il modulo si
adatta alla finestra anche con nomi lunghi, su desktop e telefono. Nessuna
modifica automatica dei corrispettivi già registrati e nessuna migrazione.

Collaudo finale: **837 PASS, 0 FAIL**, inclusi 204 Chrome e 58 verifiche di
disponibilità/preventivi. Typecheck e lint senza errori (244 warning storici),
confini e build riusciti. Verificati esempi richiesti, mesi di diversa durata,
bisestili, tariffe mancanti/gratuite, modifiche manuali e ripristino del prezzo
suggerito, conto aggiornato e occupazione del posto fino all’ultimo giorno.
Schermate desktop/telefono controllate dopo la correzione della larghezza del
modulo. Database temporaneo rimosso; localhost disponibile sulla porta 3000.

### Prefisso corretto nei contatti WhatsApp (10 ottobre 2026)

Corretto il destinatario WhatsApp sia dal pannello Quadro posti sia dalla
scheda completa: i numeri italiani senza prefisso ricevono automaticamente
39, quelli già preceduti da +39/0039 non lo duplicano e i prefissi esteri
espliciti vengono conservati. Gestiti spazi e separatori e mantenuto lo zero
iniziale dei fissi italiani. La correzione funziona anche sui proprietari
già registrati; non richiede la modifica dei numeri in anagrafica.

Un numero assente o non valido non apre collegamenti incompleti: il pannello
invita alla verifica e la scheda completa mostra un messaggio chiaro.
Conservati messaggio personalizzabile, destinatario della barca selezionata
e permessi esistenti. Nessuna modifica del database o migrazione.

Collaudo finale: **862 PASS, 0 FAIL**, inclusi 229 Chrome e 25 nuove verifiche
WhatsApp. Verificati entrambi i comandi, formati italiani/esteri, separatori,
fissi, telefono, numeri assenti/non validi e messaggio della barca selezionata.
Typecheck e lint senza errori (244 warning storici), confini e build riusciti.
Database temporaneo rimosso; localhost HTTP 200. Nessun destinatario reale
contattato e nessun recapito operativo modificato durante il collaudo.
