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
