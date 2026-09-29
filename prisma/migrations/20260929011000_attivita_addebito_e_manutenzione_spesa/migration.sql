-- O03: un solo addebito per attività (idempotenza del completamento).
-- Diagnostica di sola lettura: se ci sono già duplicati si interrompe e si segnala.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT "attivitaId" FROM "Addebito"
    WHERE "attivitaId" IS NOT NULL
    GROUP BY "attivitaId" HAVING count(*) > 1
  ) x;
  IF n > 0 THEN
    RAISE EXCEPTION 'Addebito: % attività con più di un addebito. Risolvere i duplicati prima della migrazione.', n;
  END IF;
END $$;

CREATE UNIQUE INDEX "Addebito_attivitaId_key" ON "Addebito"("attivitaId");

ALTER TABLE "Addebito" ADD CONSTRAINT "Addebito_attivitaId_fkey"
  FOREIGN KEY ("attivitaId") REFERENCES "Attivita"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- O04: costo preventivo dell'intervento + spesa collegata per id (una sola per intervento).
ALTER TABLE "Maintenance" ADD COLUMN "costoPrevistoCent" INTEGER;

ALTER TABLE "Expense" ADD COLUMN "maintenanceId" TEXT;

-- Backfill prudente: collega solo le spese «Manutenzione: <titolo>» quando il
-- collegamento è univoco (una sola spesa e un solo intervento compatibili).
-- I casi ambigui restano non collegati e vengono segnalati, senza toccare i dati.
WITH candidati AS (
  SELECT e.id AS expense_id, m.id AS maintenance_id,
         count(*) OVER (PARTITION BY e.id) AS m_count,
         count(*) OVER (PARTITION BY m.id) AS e_count
  FROM "Expense" e
  JOIN "Maintenance" m
    ON m."tenantId" = e."tenantId"
   AND m."boatId" = e."boatId"
   AND e."descrizione" = 'Manutenzione: ' || m.titolo
  WHERE e."maintenanceId" IS NULL
)
UPDATE "Expense" e
SET "maintenanceId" = c.maintenance_id
FROM candidati c
WHERE e.id = c.expense_id AND c.m_count = 1 AND c.e_count = 1;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM "Expense" WHERE "descrizione" LIKE 'Manutenzione: %' AND "maintenanceId" IS NULL;
  IF n > 0 THEN
    RAISE NOTICE 'Expense: % spese di manutenzione non collegate automaticamente (match ambiguo o intervento assente).', n;
  END IF;
END $$;

CREATE UNIQUE INDEX "Expense_maintenanceId_key" ON "Expense"("maintenanceId");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_maintenanceId_fkey"
  FOREIGN KEY ("maintenanceId") REFERENCES "Maintenance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
