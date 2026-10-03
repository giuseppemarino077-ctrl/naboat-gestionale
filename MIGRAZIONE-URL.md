# Migrazione URL (U01)

Separazione delle aree dello stesso progetto Next.js: **sito pubblico**, **area cliente**,
**gestionale** (noleggio/ormeggio/impostazioni), **pannello NaBoat** e **azioni pubbliche
per token**. Restano un solo progetto, un solo dominio e le API `/api/v1` invariate.

I vecchi indirizzi **non restituiscono 404**: `next.config.js` (`redirects()`) risponde
**307** verso il nuovo percorso. I **parametri di query vengono preservati** automaticamente
(es. `/oggi?x=1` → `/gestionale/oggi?x=1`, `/ormeggio?data=…` → `/gestionale/ormeggio?data=…`),
quindi i link già inviati per email continuano a funzionare.

## Gestionale Noleggio

| Vecchio URL | Nuovo URL |
|---|---|
| `/oggi` | `/gestionale/oggi` |
| `/calendario` | `/gestionale/calendario` |
| `/prenotazioni` | `/gestionale/prenotazioni` |
| `/prenotazioni/[id]` | `/gestionale/prenotazioni/[id]` |
| `/turni` | `/gestionale/skipper` |
| `/meteo` | `/gestionale/meteo` |
| `/flotta` | `/gestionale/flotta` |
| `/manutenzione` | `/gestionale/manutenzione` |
| `/clienti` | `/gestionale/clienti` |
| `/registro` | `/gestionale/registro` |
| `/recensioni` | `/gestionale/recensioni` |
| `/pagamenti` | `/gestionale/economia/pagamenti` |
| `/resoconto` | `/gestionale/economia/resoconto` |
| — | `/gestionale/economia` (nuova voce che raggruppa Pagamenti e Resoconto) |

## Gestionale Ormeggio

| Vecchio URL | Nuovo URL |
|---|---|
| `/ormeggio` | `/gestionale/ormeggio` |
| `/ormeggio/da-fare` | `/gestionale/ormeggio/da-fare` |
| `/ormeggio/movimenti` | `/gestionale/ormeggio/movimenti` |
| `/ormeggio/conti` | `/gestionale/ormeggio/conti` |
| `/ormeggio/configurazione` | `/gestionale/ormeggio/configurazione` |
| `/ormeggio/permanenza/[id]` | `/gestionale/ormeggio/permanenza/[id]` |

## Impostazioni

| Vecchio URL | Nuovo URL |
|---|---|
| `/impostazioni` | `/gestionale/impostazioni` (profilo pubblico azienda) |
| `/team` | `/gestionale/impostazioni/team` |
| `/listino` | `/gestionale/impostazioni/listino` |
| `/porti` | `/gestionale/impostazioni/porti` |
| `/sicurezza` | `/gestionale/impostazioni/sicurezza` |
| `/abbonamento` | `/gestionale/impostazioni/piano` |

## Accesso, onboarding e stato azienda

| Vecchio URL | Nuovo URL |
|---|---|
| `/login` | `/gestionale/accesso` |
| `/registrazione` | `/gestionale/registrazione` |
| `/invito` | `/gestionale/invito` |
| `/verifica-email` | `/gestionale/verifica-email` |
| `/password-dimenticata` | `/gestionale/password-dimenticata` |
| `/reimposta-password` | `/gestionale/reimposta-password` |
| `/in-attesa` | `/gestionale/stato` |

`/gestionale/accesso` e le pagine sorelle non richiedono un'azienda attiva e non mostrano il
menù operativo. `/gestionale/stato` è per le aziende non ancora approvate: da lì restano
raggiungibili **Sicurezza** (`/gestionale/impostazioni/sicurezza`) e **Verifica email**
(`/gestionale/verifica-email`), senza entrare nel gestionale operativo.

## Pannello NaBoat (admin)

| Vecchio URL | Nuovo URL |
|---|---|
| `/anteprima` | `/admin/anteprima` |
| `/admin` e sottopagine | invariati (`/admin`, `/admin/seo`, `/admin/backup`, …) |

Il pannello ha ora un **layout amministrativo autonomo** (`src/app/admin/layout.tsx`),
separato dal gestionale delle aziende.

## URL invariati

- **Sito pubblico**: `/`, `/chi-siamo`, `/contatti`, `/privacy`, `/termini`, `/cookie`,
  `/progetto`, `/noleggia`, `/per-noleggiatori`, `/barca/[slug]`, `/azienda/[slug]`.
- **Area cliente**: `/area`, `/area/reset`, `/area/verifica-email`.
- **Azioni pubbliche per token** (senza accesso): `/paga/[token]`, `/contratto/[token]`,
  `/contratto-ormeggio/[token]`.
- **API**: tutto `/api/v1/...` è rimasto identico.

## Note tecniche

- Nessun sottodominio: **un solo dominio**, aree distinte da segmenti reali di percorso.
- I contenitori sono decisi dai layout (`(sito)`, `(pubblico)`, `area`, `gestionale/(accesso)`,
  `gestionale/(stato)`, `gestionale/(portale)`, `admin`), non più da elenchi di pathname in
  `Navigazione.tsx`.
- I controlli di accesso restano nei servizi/API (`requireTenant`, `requireSuperadmin`,
  `requireCliente`) e nel middleware; i layout servono solo a orientare l'interfaccia.
- Il gestionale resta **noindex**: `robots.ts` blocca `/gestionale`, `/admin`, `/area` e le
  pagine per token.
- Le **liste** (prenotazioni, clienti, spese, incassi) hanno mantenuto il percorso: la
  forma è retro-compatibile (array con header `X-Total-Count`) e diventa un involucro
  `{ items, totale, pagina, dimensione, pagine }` solo con `?page=`. Vedi README e AGENTS.
