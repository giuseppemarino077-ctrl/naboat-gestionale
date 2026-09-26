-- Cancella i dati di prova (aziende il cui nome contiene "Smoke") e le relative voci di registro.
-- Uso sul VPS (dalla cartella del progetto):
--   docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB < prisma/pulizia-dati-test.sql
-- La cancellazione di un Tenant è a cascata su barche, prenotazioni, clienti, incassi,
-- spese, manutenzioni, tariffe, skipper, extra e abbonamenti.
-- Le voci di AuditLog non hanno legame a cascata: vengono rimosse esplicitamente.

BEGIN;

SELECT count(*) AS aziende_da_cancellare FROM "Tenant" WHERE nome LIKE '%Smoke%';

DELETE FROM "AuditLog" WHERE "tenantId" IN (SELECT id FROM "Tenant" WHERE nome LIKE '%Smoke%');
DELETE FROM "Tenant" WHERE nome LIKE '%Smoke%';

COMMIT;

SELECT count(*) AS aziende_rimaste FROM "Tenant";
SELECT nome, status FROM "Tenant" ORDER BY nome;
