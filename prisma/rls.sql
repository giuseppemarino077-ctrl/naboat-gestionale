-- ============================================================================
-- NaBoat — RLS (Row Level Security) come difesa in profondità.
--
-- Presupposto: lo scoping applicativo per tenantId c'è già in tutte le query.
-- Questa è la seconda barriera: si attiva DOPO, con un refactoring dedicato e
-- su una copia verificata. NON va eseguito a cuor leggero in produzione.
--
-- Modello dei ruoli:
--   * naboat_app   — ruolo runtime per le richieste delle aziende. È SOGGETTO
--                    alle policy: vede solo le righe con tenantId = app.tenant_id,
--                    impostato con set_config('app.tenant_id', <id>, true) dentro
--                    la transazione (vedi src/lib/db.ts, conTenant()).
--   * naboat_admin — ruolo dedicato a NaBoat, ai lavori cron e ai backup.
--                    Ha BYPASSRLS (controllato) perché deve operare su tutte le
--                    aziende. Non è una policy aperta: è un percorso esplicito
--                    che va usato solo dove serve (DATABASE_URL_ADMIN).
--
-- Casi previsti:
--   * letture pubbliche (marketplace): policy di SOLA LETTURA sulle righe
--     pubblicate, senza contesto tenant. Vedi il blocco "letture pubbliche".
--   * superadmin/cron/backup: passano da naboat_admin (BYPASSRLS). In alternativa,
--     per richieste autenticate di piattaforma si può usare lo stesso ruolo.
--
-- ATTIVAZIONE (solo su copia, con backup verificato):
--   1) eseguire questo file come superuser/owner del database;
--   2) impostare una password reale ai due ruoli (creati con password casuale
--      non nota) e aggiornare le variabili nel .env:
--        ALTER ROLE naboat_app   LOGIN PASSWORD '<password-app>';
--        ALTER ROLE naboat_admin LOGIN PASSWORD '<password-admin>';
--        DATABASE_URL=postgresql://naboat_app:<password>@db:5432/naboat
--        DATABASE_URL_ADMIN=postgresql://naboat_admin:<password>@db:5432/naboat
--        RLS_ENABLED=true
--   3) far girare le query di tenant dentro conTenant() (src/lib/db.ts) e le
--      rotte di piattaforma con prismaPiattaforma();
--   4) collaudare con scripts/verifica-rls.mjs e con lo smoke test.
--
-- ROLLBACK: vedi la sezione 8 di DEPLOY.md (DROP POLICY + DISABLE ROW LEVEL
-- SECURITY + ritorno del DATABASE_URL all'utente owner).
--
-- Rende il file idempotente: si può rieseguire più volte senza errori.
-- ============================================================================

-- 1) Ruoli dedicati ----------------------------------------------------------
-- Creati con una password casuale NON nota: va reimpostata esplicitamente
-- (ALTER ROLE ... LOGIN PASSWORD '...') solo al momento dell'attivazione.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'naboat_app') THEN
    EXECUTE format('CREATE ROLE naboat_app WITH LOGIN PASSWORD %L', gen_random_uuid()::text);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'naboat_admin') THEN
    EXECUTE format('CREATE ROLE naboat_admin WITH LOGIN BYPASSRLS PASSWORD %L', gen_random_uuid()::text);
  END IF;
END $$;

-- Il ruolo di piattaforma deve sempre poter aggirare la RLS in modo esplicito.
ALTER ROLE naboat_admin BYPASSRLS;

-- 2) Permessi ----------------------------------------------------------------
DO $$
DECLARE db text := current_database();
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO naboat_app, naboat_admin', db);
END $$;

GRANT USAGE ON SCHEMA public TO naboat_app, naboat_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO naboat_app, naboat_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO naboat_app, naboat_admin;

-- Tabelle/sequenze create dalle migrazioni successive al ruolo owner.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO naboat_app, naboat_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO naboat_app, naboat_admin;

-- 3) RLS + policy di isolamento per OGNI tabella con tenantId -----------------
-- Il contesto arriva dalla transazione: set_config('app.tenant_id', ..., true).
-- Se non è impostato, current_setting(..., true) è NULL e la riga non passa.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND EXISTS (
        SELECT 1 FROM information_schema.columns col
        WHERE col.table_schema = 'public'
          AND col.table_name = c.relname
          AND col.column_name = 'tenantId'
      )
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', r.relname);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO naboat_app '
      'USING ("tenantId" = current_setting(''app.tenant_id'', true)) '
      'WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      r.relname
    );
  END LOOP;
END $$;

-- 4) Letture pubbliche (marketplace) -----------------------------------------
-- Righe pensate per essere consultate senza accesso. Sono SOLO in lettura e
-- valgono solo per il ruolo runtime: l'azienda resta comunque isolata.
DROP POLICY IF EXISTS lettura_pubblica ON public."Boat";
CREATE POLICY lettura_pubblica ON public."Boat" FOR SELECT TO naboat_app
  USING ("pubblicata" AND NOT "inPausa" AND NOT "archiviato" AND NOT "bloccataAdmin");

DROP POLICY IF EXISTS lettura_pubblica ON public."Porto";
CREATE POLICY lettura_pubblica ON public."Porto" FOR SELECT TO naboat_app USING (true);

DROP POLICY IF EXISTS lettura_pubblica ON public."Tariffa";
CREATE POLICY lettura_pubblica ON public."Tariffa" FOR SELECT TO naboat_app USING (true);

DROP POLICY IF EXISTS lettura_pubblica ON public."Extra";
CREATE POLICY lettura_pubblica ON public."Extra" FOR SELECT TO naboat_app USING ("attivo");

DROP POLICY IF EXISTS lettura_pubblica ON public."Recensione";
CREATE POLICY lettura_pubblica ON public."Recensione" FOR SELECT TO naboat_app USING ("stato" = 'pubblicata');

-- Le medie dei voti nelle schede pubbliche leggono le prenotazioni recensite:
-- si aprono in lettura SOLO le prenotazioni che hanno una recensione pubblicata.
DROP POLICY IF EXISTS lettura_recensita ON public."Booking";
CREATE POLICY lettura_recensita ON public."Booking" FOR SELECT TO naboat_app
  USING (EXISTS (
    SELECT 1 FROM public."Recensione" r
    WHERE r."bookingId" = "Booking"."id" AND r."stato" = 'pubblicata'
  ));

-- 5) Report di copertura -----------------------------------------------------
-- Eseguire questo file stampa l'elenco: tabelle con tenantId, RLS attiva e policy.
SELECT
  c.relname                                   AS tabella,
  c.relrowsecurity                            AS rls_attiva,
  (SELECT count(*) FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND EXISTS (
    SELECT 1 FROM information_schema.columns col
    WHERE col.table_schema = 'public'
      AND col.table_name = c.relname
      AND col.column_name = 'tenantId'
  )
ORDER BY c.relname;
