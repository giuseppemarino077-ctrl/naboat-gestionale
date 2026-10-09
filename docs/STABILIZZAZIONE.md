# Stabilizzazione preparatoria — 9 ottobre 2026

## Interventi

- Contesto Docker: esclusi file di ambiente reali, `.git`, cartelle di credenziali,
  upload pubblici/privati, archivi dati e log. Restano disponibili i template.
- PostgreSQL/Redis locali: porte limitate a `127.0.0.1`; container ricreati con
  conservazione dei volumi, binding verificato.
- Collaudo ripetibile: `npm run test:isolated` crea un database locale vuoto con
  nome casuale, copia codice e dipendenze in una cartella temporanea, applica
  migrazioni, prepara account temporanei, compila e avvia la build di produzione.
  Esegue smoke generale, Ormeggio, Oggi e regressioni della stabilizzazione.
  I file di ambiente reali non vengono copiati; Stripe, SMTP, S3, FTP, Google e
  Turnstile sono disabilitati nel collaudo. Open-Meteo può essere interpellato.
  Le chiavi Redis hanno un prefisso casuale e scadono normalmente; non si usa
  FLUSHDB sul Redis di sviluppo. Server, database e cartella temporanei sono
  rimossi al termine, anche in caso di errore gestito.
- CI: Redis aggiunto ai servizi e collaudo isolato dopo i controlli esistenti.
- Protezione degli smoke: gli script rifiutano indirizzi remoti e database
  ordinari. Usare il comando unico; PostgreSQL locale deve consentire CREATE/DROP
  DATABASE. Non è una procedura da eseguire sul VPS di produzione.
- Tipi barca: le API rifiutano codici sconosciuti; duplicazione conserva
  `tipoCodice` e `modelloTesto`. Il filtro pubblico del tipo conserva anche il
  requisito della foto, evitando di sovrascriverne la condizione OR.
- Tipo/modello propagati al pannello barche, ai nuovi snapshot contrattuali e ai
  PDF. Gli snapshot già firmati restano immutabili; i campi nuovi sono opzionali
  per leggere i documenti storici.
- Combobox: navigazione da tastiera, opzione attiva per tecnologie assistive,
  chiusura alla perdita di focus e attivazione con click.
- Permessi importi: lettura/scrittura extra e PDF contratto noleggio rispondono
  403 senza permesso. Il PDF contiene importi anche quando nasce da uno snapshot.
- Associazioni extra: togliere l'ultima barca mantiene `scope=elenco` vuoto;
  il preventivo rispetta questa esclusione.
- Smoke disponibilità: la prova dell'HTML esclude gli script incorporati di
  Next.js; i dati diagnostici del rendering non equivalgono a una scheda visibile.
- Documentazione: aggiornati perimetro, contesto, comandi e bootstrap superadmin
  tramite il servizio `tools`; le consegne precedenti sono marcate come storiche.
- Dipendenze: Next.js ed eslint-config-next aggiornati a 15.5.27, sharp a 0.35.5
  e source-map-js a 1.2.2. Audit di produzione: 0 vulnerabilità note.
  L'audit completo segnala ancora 9 voci nelle dipendenze di sviluppo
  (7 alte, 2 moderate), incluse catene Tailwind/ESLint: la proposta automatica
  comprende cambi di versione principale e richiede un intervento separato.

## Verifiche

Il primo collaudo isolato con server di sviluppo ha prodotto:

| Verifica | Esito |
|---|---|
| Migrazioni su database vuoto | 55 applicate |
| Typecheck | 0 errori |
| Lint | 0 errori, 261 warning |
| Smoke generale | 386 PASS / 0 FAIL |
| Smoke Ormeggio | 38 PASS / 0 FAIL |
| Verifica Oggi | 19 PASS / 0 FAIL |
| Binding Docker | DB 127.0.0.1:5434, Redis 127.0.0.1:6380 |

Il collaudo finale con Next.js 15.5.27 ha completato la build di produzione e
55 migrazioni su database vuoto: smoke generale 386 PASS, Ormeggio 38 PASS,
Oggi 19 PASS, regressioni aggiuntive 22 PASS. Totale: **465 PASS, 0 FAIL**.
Typecheck: 0 errori. Lint: 0 errori, 261 warning. L'ambiente temporaneo è stato
rimosso al termine. La CI è configurata, ma non è stata eseguita su GitHub
durante questo intervento.

Nessun collaudo di pagamenti reali, consegna SMTP, S3 o VPS di produzione è
dimostrato da questi test. La stabilizzazione iniziale non includeva un browser
automatizzato; la successiva revisione [Ormeggio](ORMEGGIO-USABILITA.md) aggiunge
il collaudo Chrome desktop/mobile. Il comportamento fisico su dispositivi touch
richiede comunque una prova sul dispositivo.
Il lavoro precedente non committato è conservato; nessun deploy è stato eseguito.

## Decisioni commerciali da prendere

| Tema | Proposta concreta | Cosa manca per implementare |
|---|---|---|
| Riscossione fee NaBoat | Primo passo: rendiconto periodico delle fee maturate, con fatturazione alle aziende | Periodicità, rettifiche per rimborsi, modalità di saldo e testi contrattuali. Alternativa: onboarding Stripe Connect e ripartizione automatica, progetto distinto |
| Piano Pro | Conservare la concessione manuale fino a definire il prodotto pagato | Durata, prova, prezzi approvati, rinnovo/cancellazione e rapporto con attivazione/manutenzione e modulo Ormeggio |
| Prezzi extra | Migrazione additiva a `prezzoCent`, con backfill e compatibilità temporanea dell'API in euro | Gestione dei valori legacy oltre due decimali e coordinamento dei lettori/scrittori, inclusi seed, preventivi e schermate |
| Unità extra | Per ora/giorno/persona: prezzo unitario × quantità × unità fatturabili, congelato nel preventivo | Arrotondamento di ore/giorni, significato della quantità per persona e limiti. Gli override per barca vanno applicati nello stesso servizio |

Le proposte non attivano addebiti, trasferimenti o nuovi rinnovi. Il campo
`Extra.prezzo` in euro Float e il motore prezzo×quantità restano debito tecnico
esplicito; la correzione dello scope non introduce una nuova regola commerciale.

## Preparazione al lavoro Ormeggio

La base interna è presente e il test esistente copre conflitti concorrenti,
trasferimenti storici, conversione noleggio/custodia, addebiti idempotenti,
rettifica/storno, firma e PDF. La fase successiva va definita sul flusso operativo
richiesto dal proprietario; self-service e assegnazione automatica restano da
progettare. RLS resta disattivata; nessuna modifica alle regole di dominio o alle
sezioni di sicurezza è necessaria per questa preparazione.
