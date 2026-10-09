# NaBoat Gestionale — perimetro attuale

Aggiornamento: 9 ottobre 2026. Contesto operativo in `docs/PROJECT_CONTEXT.md`;
regole in `AGENTS.md`, verifiche in `docs/STABILIZZAZIONE.md`.

## Architettura

Monolite Next.js 15, React 19 e TypeScript, PostgreSQL 15 con Prisma 5, Redis e
Tailwind CSS. App e API nello stesso progetto. Deploy documentato: VPS Aruba con
Docker Compose e Caddy. Sito e portale condividono `naboat.it`.
L'isolamento è applicativo per tenant; RLS resta disattivata.

## Perimetro implementato

- Noleggio: flotta, calendario/planning, prenotazioni, skipper, anagrafica,
  tariffe, extra, esperienze, blocchi, manutenzioni, check-in/out e contratti.
- Marketplace: catalogo e profili pubblici, richieste con opzione, area cliente,
  patenti private, recensioni moderate e SEO configurabile.
- Economia: Stripe per azienda, incassi manuali, rimborsi, cauzioni, servizi NaBoat,
  spese e report. La fee marketplace è registrata; la riscossione è da decidere.
- Ormeggio interno: aree/posti, permanenze, assegnazioni storiche, movimenti,
  attività, addebiti, conti, contratti e permesso importi.
- Piattaforma: amministrazione, notifiche SMTP, backup e ripristino, health/readiness.

## Da completare e verificare

Self-service Ormeggio e assegnazione automatica; automazione commerciale Pro;
motore extra per unità e migrazione del prezzo legacy; collaudo esterno Stripe,
SMTP e S3; verifica browser e produzione. Supabase e Brevo non sono integrati;
Vercel non è il target di deploy documentato.

## Vincoli operativi

Un solo VPS è un punto di guasto comune: servono backup esterni e prove di
ripristino. Gli smoke modificano impostazioni globali: usare esclusivamente
`npm run test:isolated`, con database temporaneo. I costi e le stime del vecchio
MVP non costituiscono un preventivo attuale.
