# NaBoat Gestionale — D1 Perimetro, architettura e roadmap (MVP Fase 1)

## 1. Perimetro MVP (da RFQ_NaBoat.pdf)
Account/governance (registrazione owner, approvazione/rifiuto/sospensione/eliminazione NaBoat, operatori del proprietario), cruscotto Oggi, flotta+skipper+extra, calendario centrale con stati libera/prenotata/bloccata/in_mare/rientrata, prenotazioni con anti-overlap e logica patente/skipper, clienti con deduplica e WhatsApp precompilato, PWA mobile-first installabile. Stato: implementato in `naboat-gestionale/` (27 route, 3 migration).

## 2. Stack e architettura (singolo VPS, ibrida)
Next.js 14 monolite modulare (frontend + API `/api/v1`), Postgres 15 + Prisma, Redis, Caddy (TLS), Docker Compose. `app/api.naboat.it` su Aruba Cloud VPS O2A4 (2 vCPU, 4 GB, 40 GB, datacenter Italia); `www` + email su hosting IT; transazionale via SMTP Aruba del dominio. Multi-tenant per `tenantId` + RLS prod pronta (`prisma/rls.sql`) + trigger anti-overlap DB. stima Fase 2: marketplace riusa `/api/v1` + nuovo `public/availability`; app consumer nativa/PWA quotata a parte (range indicativo 4-8 settimane quando il gestionale è stabile).

## 3. MVP essenziale vs consigliata
Implementato e verificato: perimetro punto 1 + hardening di sicurezza (2FA TOTP, verifica email, rate-limit Redis, Turnstile, CSP/header, dipendenze aggiornate con 0 vulnerabilità, backup offsite + restore drill, `/api/readyz`). Restano da attivare in ambiente reale (richiedono accesso a servizi/dominio): Cloudflare WAF/bot + Turnstile keys, DKIM/DMARC, Sentry/uptime con DSN, e l'attivazione RLS (richiede refactoring transazioni, vedi DEPLOY.md §8).

## 4. Costi ricorrenti stimati
VPS Aruba O2A4 6,29€ + IVA (~7,70€) + object storage/snapshot ~6€ + email SMTP Aruba (inclusa nella casella del dominio) + hosting/dominio/caselle ~10€ ≈ 25€/mese. Nessuna licenza lock-in.

## 5. Rischi e mitigazioni
Calendario concorrenza → doppio livello app+trigger DB (verificato). Singolo VPS = SPOF → backup giornalieri + snapshot + restore drill; upgrade a DB managed + 2 VPS senza riscrittura (API stateless). Timezone → `timestamptz` ovunque.

## 6. Escluso (da quotare a parte)
App/marketplace Fase 2, parsing automatico WhatsApp, pagamenti online, nativa, integrazioni terze non elencate.
