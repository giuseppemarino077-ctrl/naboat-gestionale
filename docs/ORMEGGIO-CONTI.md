# Conto delle barche: addebiti e incassi

Aggiornamento del 12 ottobre 2026. Il flusso riguarda il modulo Ormeggio.

## Registrare il pagamento di una voce

Nella scheda barca, sezione Conto, «Segna pagato» apre una conferma con importo
ancora scoperto, metodo (Contanti, POS, Bonifico) e data dell’incasso. La conferma
crea un `Payment` pagato, collegato sia alla permanenza sia all’addebito mediante
`Payment.addebitoId`. Incasso, stato e audit sono salvati nella stessa transazione.

Esempio: addebito di 100 € e acconto esterno di 25 € già registrato. La voce mostra
«Parziale», quota coperta 25 € e residuo 75 €. Segnarla pagata registra 75 €;
il conto mostra 100 € incassati e residuo zero. La tabella Incassi riporta metodo,
data effettiva e descrizione con collegamento alla voce. Non serve un secondo
inserimento nel form «Registra incasso esterno».

Il form degli incassi esterni resta disponibile per acconti, pagamenti generali e
anticipi. Gli incassi senza un addebito specifico coprono le voci in ordine di
data; i vecchi stati pagato hanno precedenza per rispettare la riconciliazione
storica. Gli incassi con collegamento esplicito coprono prima la propria voce.
Le eccedenze restano credito sulla stessa permanenza e coprono nuovi addebiti.
Una voce gratuita non genera pagamenti da zero euro.

## Un solo calcolo del conto

`src/modules/ormeggio/conto.ts` contiene il calcolo condiviso da scheda barca,
elenco addebiti, Economia, segnalazioni della mappa, PDF, contratto pubblico e
residui delle Statistiche. Gli stati visibili delle voci derivano dalla copertura
effettiva: Pagato, Parziale o Da pagare. La spunta storica non costituisce denaro.

Il saldo usa incassi confermati, al netto dei rimborsi riusciti; rimborsi pendenti
o falliti non riducono il denaro ricevuto. `rimborsoCent` e righe Refund non vengono
sommati due volte. Cauzioni riconoscibili escluse dal saldo dei servizi. Rettifiche
negative riducono il debito. Importi sempre in centesimi interi.

Economia somma i residui delle singole permanenze e mostra separatamente i crediti:
il credito di una barca non nasconde il debito di un’altra. Incassi e grafici delle
statistiche usano la data `paidAt`, compresi i pagamenti registrati dalla voce.

## Voci e incassi precedenti

La migrazione è additiva e non inventa incassi per gli addebiti che erano già
segnati pagati. Se gli incassi esistenti non bastano, la scheda mostra «Incasso da
verificare». Il titolare verifica il denaro ricevuto e lo registra con metodo e
data reali. Se è già presente un acconto sufficiente, non viene creato altro denaro.
Le letture del conto non aggiornano automaticamente dati storici.

## Concorrenza, permessi e rettifiche

Ogni modifica finanziaria del modulo acquisisce il lock della permanenza prima
del lock della risorsa. `If-Match` protegge le revisioni; un conto cambiato rispetto
all’importo confermato viene rifiutato con 409. Due sessioni sulla stessa voce non
producono due incassi. Ripetere il pagamento di una voce coperta non crea denaro.
Gli incassi esterni conservano l’idempotenza tramite `Idempotency-Key`.

Le risposte delle modifiche espongono la revisione aggiornata, così una seconda
operazione della stessa sessione può usare la versione corretta. Il client blocca
salvataggi contemporanei e segnala il cambiamento alle altre schermate.

Restano obbligatori tenant e permesso importi. Non si possono eliminare, riaprire
con una spunta o cambiare l’importo di voci già incassate; anche gli storni e le
rettifiche delle attività controllano la copertura effettiva. Le correzioni devono
conservare lo storico. Non cambia il flusso di incasso del modulo Noleggio.

## Migrazione e verifica

Migrazione `20261011192504_ormeggio_incassi_addebiti`: campo opzionale e relazione
`Payment.addebitoId`, indici per addebito e per azienda/permanenza. Applicata in
locale, client generato e server di sviluppo riavviato. In un futuro rilascio
usare il consueto flusso di backup e `prisma migrate deploy`.

`scripts/verifica-conto-ormeggio.mjs` è incluso in `npm run test:isolated`: verifica
pagamenti, acconti, crediti, rimborsi, voci storiche, permessi, tenant, revisioni,
concorrenza, PDF, contratto, mappa e statistiche. Il collaudo Chrome comprende
conferma/annullamento, pagamento parziale e layout desktop/telefono. Tutte le
scritture automatiche usano esclusivamente il database temporaneo.

Collaudo finale del 12 ottobre 2026: **1209 PASS, 0 FAIL** (850 API/regressioni,
sei unitari, 353 Chrome). Le 38 verifiche specifiche del conto comprendono anche
l’orario effettivo degli incassi di oggi. Typecheck senza errori, lint senza errori
(254 warning storici), confini rispettati e build di produzione riuscita.
Schermata telefono ispezionata; ambiente temporaneo rimosso. Sviluppo locale su
localhost:3000 con database e Redis disponibili.
