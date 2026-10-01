# Matrice di parità NaBoat ↔ BOATLY — Calendario e Flotta

Riferimento BOATLY: `main` / `e7358e2dd6682cdcbfa3d5829f83c4d16f6bf74e` (estratto in
`../BOATLY-rif`, esterno al progetto). Base NaBoat di partenza: `main` / `5c8f403`.
Branch di lavoro: `lavoro-calendario-flotta-boatly`.

Legenda stato: **Fatto** = funziona con dati reali; **Parziale** = funziona ma con
semplificazioni dichiarate; **Rimandato** = non implementato in questo intervento.

> Nota di metodo: l'analisi BOATLY è statica sui sorgenti. La verifica eseguita è
> automatica via API (`scripts/smoke-test.mjs`, `scripts/smoke-ormeggio.mjs`) e
> `npm run build`. La verifica visiva browser è rimandata al proprietario.

## Calendario

| ID | Sorgente BOATLY | Destinazione NaBoat | Endpoint/servizio | Stato | Verifica |
|---|---|---|---|---|---|
| C01 | `operator/calendar/page.tsx`, `operator-schedule.tsx` | `/gestionale/calendario`, `page.tsx` (nav URL `?start`) | `GET /api/v1/calendar` | **Fatto** — 45 giorni da oggi, nav ±20, Oggi, `start` validato, history/popstate | build; smoke `/calendar` |
| C02 | `operator-schedule.tsx` desktop | `PlanningCalendario` (tabella sticky 224/86/82 px) | `GET /api/v1/calendar` | **Fatto** — riga per barca ordinata per nome, colonna sticky, oggi/weekend, link scheda | build |
| C03 | `operator-schedule.tsx` mobile | striscia giorni snap + card per barca | idem | **Fatto** | build |
| C04 | `cellAppearance`/`primaryCellItem` | `src/lib/planning.ts` (`occupaGiorno`, `aspettoCella`, `primoElemento`) | proiezione da Booking+Block | **Fatto** — intervalli semiaperti, tutti i giorni attraversati, priorità in mare/prenotata/rientrata/blocco | build |
| C05 | dialog cella | dialogo cella (`PlanningCalendario`) | — | **Parziale** — struttura desktop/mobile, footer, focus/Escape via pattern; verifica accessibilità completa rimandata | build |
| C06 | `calendar-booking-form.tsx` | `FormCellaNuova.tsx` | `POST /api/v1/bookings` | **Fatto** — nome 2–160, telefono 8–15 normalizzato, patente Sì/No, skipper 4 stati, skipper inline in transazione, prezzo/da definire atomici | smoke (creazione, patente, idempotenza, conflitti) |
| C07 | `calendar-cell-actions.tsx` (`blockCalendarDay`, `releaseCalendarDay` scope) | `BloccoCella`, `/api/v1/blocks/[id]/giorno` | `POST /api/v1/blocks`, `POST /api/v1/blocks/[id]/giorno`, `DELETE` | **Fatto** — blocco giorno civile; split giorno/intero periodo atomico sotto lock, 0/1/2 residui, no intervalli vuoti | build; codice |
| C08 | `CalendarMarkDeparted/ReturnedForm` | `SchedaPrenotazione` | `POST /bookings/[id]/checkin|checkout` | **Fatto** — usa il servizio presenze; dopo partenza IN MARE, dopo rientro RIENTRATA | smoke (presenze) |
| C09 | `booking-skipper-form.tsx` | `FormSkipper` in `SchedaPrenotazione` + | `PATCH /bookings/[id]` | **Parziale** — 3 stati persistiti (`skipperStato`), note, skipper inline; contatto WhatsApp skipper non in questo form | smoke (stati) |
| C10 | `customer-form.tsx` calendarMode | `FormCliente` | `PATCH /api/v1/customers/[id]` | **Fatto** — aggiorna l'anagrafica reale, dedup telefono/email, no fusione | smoke (anagrafica) |
| C11 | `reschedule-booking-form.tsx` | `FormRiprogramma` | `POST /api/v1/bookings/[id]/riprogramma` | **Fatto** — annulla originale + crea sostituta collegata in transazione, motivo obbligatorio, blocchi su marketplace/firma/pagamenti | build; codice |
| C12 | `CalendarCancelBookingForm` | elimina/annulla | `DELETE /api/v1/bookings/[id]` | **Fatto** — annullamento logico, token/checkout spenti, storico conservato | smoke |
| C13 | `whatsapp-booking-link.tsx`, `whatsapp.ts` | `linkWhatsApp`/`testoRiepilogo` | nessuna rotta (bozza `wa.me`) | **Fatto** — normalizzazione +/00/39, testi senza «Boatly» | build |
| C14 | `operator-today-dashboard.tsx`, `today-dashboard.ts` | `CruscottoOggi.tsx` | `GET /api/v1/calendar` (finestra oggi separata) | **Parziale** — 4 metriche cliccabili, gruppi per orario, avvisi (telefono/skipper/turnaround/booking+blocco), Prossimo; senza paginazione dedicata oltre i limiti | build |

## Flotta

| ID | Sorgente BOATLY | Destinazione NaBoat | Endpoint | Stato | Verifica |
|---|---|---|---|---|---|
| F01 | `fleet/page.tsx` | `/gestionale/flotta` | `GET /api/v1/boats` | **Fatto** — card per updatedAt desc, badge eliminazione, ricerca, archivio, uso noleggio separato | build; smoke |
| F02 | `fleet/new/page.tsx` | `/gestionale/flotta/nuova` | `POST /api/v1/boats` | **Fatto** — 3 campi essenziali, potenza decimale, patente esplicita, capacità ignota (null) | smoke (crea barca) |
| F03 | `fleet/[boatId]/layout.tsx` | `flotta/[id]/layout.tsx` | `GET /api/v1/boats/[id]` | **Fatto** — 6 voci nell'ordine + «Altre impostazioni» + Foto | build |
| F04 | `[boatId]/page.tsx`, `duplicate-boat-form.tsx` | `flotta/[id]/page.tsx` | `PATCH /boats/[id]`, `POST /boats/[id]/duplicate` | **Fatto** — salvataggio parziale sicuro, risposta completa, duplicazione con whitelist (modalità/dotazioni/extra/tariffe) | smoke (duplica barca) |
| F05 | `services/page.tsx` | `flotta/[id]/servizi` | — | **Fatto** (landing 3 card) | build |
| F06 | `amenities/` | `flotta/[id]/dotazioni` + `/api/v1/boats/[id]/dotazioni` | PUT associazioni + note, catalogo per categoria, legacy preservato | **Parziale** — catalogo predefinito nostro (voci BOATLY non disponibili nel sorgente) | build |
| F07 | `extras/` | `flotta/[id]/extra` + `/api/v1/boats/[id]/extra` + `/api/v1/extras` | **Parziale** — 3 aree (crea/catalogo/associazioni+override), unità per_ora/per_unità, scope esplicito; motore di calcolo condiviso per unità **non** implementato (resta prezzo×quantità) | build |
| F08 | `offering/` | `flotta/[id]/modalita` + `/api/v1/boats/[id]/offerte` | **Fatto** — 3 modalità, skipper 4 valori, guida autonoma, età ≥18, note; salvataggio indipendente | build |
| F09 | `pricing/` | `flotta/[id]/prezzi` + `/api/v1/tariffe` | **Parziale** — nome piano/durata/modalità integrate nella `Tariffa` esistente (non due listini); precedenze stagionali conservate | build |
| F10 | `availability/` | `flotta/[id]/disponibilita` + `/api/v1/blocks` (from/to intersezione) | **Fatto** — stessi `Block`, split giorno allineato al calendario | smoke (blocchi) |
| F11 | `status/` | `flotta/[id]/stato` + `/api/v1/boats/[id]/rimozione` | **Fatto** — disponibilità operativa distinta da manutenzione/archivio; rimozione differita persistita + finalizzazione idempotente | build; codice |
| F12 | `photos/`, `publication/` | `flotta/[id]/foto` | `/api/v1/uploads`, `PATCH /boats/[id]` | **Parziale** — upload 5 MB/`sharp`, copertina, riordino, elimina, pubblica/pausa/archivia; workflow BOATLY non importato | build; smoke (foto) |

## Architettura e integrazione

| ID | Requisito | Stato | Note |
|---|---|---|---|
| I01 | Un solo modello operativo | **Fatto** | Prisma/API/sessione NaBoat; nessun Supabase/localStorage |
| I02 | Schema additivo senza perdita dati | **Fatto** | migrazione `20261001120000_calendario_flotta_boatly` con backfill (skipperStato, patenteRisposta, scope, updatedAt) |
| I03 | API riusate ed estese | **Parziale** | calendar/bookings/blocks/boats/customers/tariffe/extras estese; nuovi comandi riprogramma, rinuncia giorno blocco, offerte, dotazioni, extra barca, rimozione |
| I04 | Permessi e isolamento | **Parziale** | tenant su ogni query; `vedeImporti` su extra e dettaglio; proiezione ridotta per skipper; audit permessi completo **non** rifatto |
| I05 | Transazioni/conflitti/retry | **Parziale** | lock barca/skipper, idempotenza booking, CAS `updatedAt`; sovrapposizione **stesso cliente** su barche diverse **non** aggiunta |
| I06 | Date/intervalli | **Parziale** | riuso `Europe/Rome`; nuovo confine esclusivo in `planning.ts`; `fineGiorno` esistente lasciato invariato |
| I07 | Sincronizzazione | **Parziale** | `useAggiornamenti` + `segnalaCambiamento`; nessun BroadcastChannel |

## Differenze deliberate (dichiarate)

- **Prezzo zero non implicito**: il form rapido richiede prezzo o «da definire»; un incasso manuale con prezzo assente è rifiutato (il vecchio `total_cents = 0` non è trasferito).
- **Rimozione barca**: rimozione operativa differita (2 minuti) con storico intatto; nessuna cancellazione fisica quando esistono relazioni (FK `Restrict` conservate).
- **Capacità ignota**: `capienza` ora nullable; niente default 2; i lettori pubblici mostrano «da definire».
- **Tipografia**: riprodotta scala/pesi BOATLY con i font NaBoat (`DM Sans`/`Manrope`), senza importare Geist per non alterare il tema globale.
- **Catalogo dotazioni**: elenco predefinito nostro (il catalogo puntuale BOATLY non era nel sorgente fornito).
- **Motore extra**: unità e override persistiti; il calcolo per-ora/per-giorno/per-persona resta quello storico (prezzo × quantità) — da completare.

## Prova eseguita

- `npm run build` → OK (tutte le nuove pagine compilate).
- `npm run typecheck` → 0 errori.
- `npm run lint` → 0 errori (264 warning, in gran parte preesistenti).
- `node scripts/smoke-test.mjs http://localhost:3000` → **380 PASS / 1 FAIL**.
  - L'unico FAIL è `sitemap contiene le pagine pubblicate`, dovuto a dati di test
    accumulati (95 tenant «Smoke A»; la pagina SEO selezionata ha `noindex=true`
    da esecuzioni precedenti). Non collegato a Calendario/Flotta.
- `node scripts/smoke-ormeggio.mjs http://localhost:3000` → **38 PASS / 0 FAIL**.
