-- RLS produzione (Difesa in profondità, DOPO lo scoping applicativo già presente).
-- Eseguire una tantum sul DB prod come superuser, POI far connettere l'app come ruolo 'app'.
-- NOTA: l'app oggi si connette come owner (bypassa RLS). Per attivare:
--   1) psql -f prisma/rls.sql
--   2) DATABASE_URL con utente app + password dedicata
--   3) ogni request imposta: SET LOCAL app.tenant = '<tenantId>' dentro transazione.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app WITH LOGIN PASSWORD 'SOSTITUIRE_PASSWORD_APP_32CHAR';
  END IF;
END $$;

GRANT CONNECT ON DATABASE naboat TO app;
GRANT USAGE ON SCHEMA public TO app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;

ALTER TABLE "Boat" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Booking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Block" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Skipper" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Extra" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "Boat";
CREATE POLICY tenant_isolation ON "Boat" FOR ALL TO app USING ("tenantId" = current_setting('app.tenant', true));
DROP POLICY IF EXISTS tenant_isolation ON "Customer";
CREATE POLICY tenant_isolation ON "Customer" FOR ALL TO app USING ("tenantId" = current_setting('app.tenant', true));
DROP POLICY IF EXISTS tenant_isolation ON "Booking";
CREATE POLICY tenant_isolation ON "Booking" FOR ALL TO app USING ("tenantId" = current_setting('app.tenant', true));
DROP POLICY IF EXISTS tenant_isolation ON "Block";
CREATE POLICY tenant_isolation ON "Block" FOR ALL TO app USING ("tenantId" = current_setting('app.tenant', true));
DROP POLICY IF EXISTS tenant_isolation ON "Skipper";
CREATE POLICY tenant_isolation ON "Skipper" FOR ALL TO app USING ("tenantId" = current_setting('app.tenant', true));
DROP POLICY IF EXISTS tenant_isolation ON "Extra";
CREATE POLICY tenant_isolation ON "Extra" FOR ALL TO app USING ("tenantId" = current_setting('app.tenant', true));
