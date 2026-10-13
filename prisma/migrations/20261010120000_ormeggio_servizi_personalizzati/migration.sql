ALTER TABLE "ServizioCatalogo" ADD COLUMN "predefinito" BOOLEAN NOT NULL DEFAULT false;

-- Le inizializzazioni storiche inserivano un unico lotto con la stessa data,
-- seguito dall'audit. Il nome non identifica l'origine dei servizi rinominati.
UPDATE "ServizioCatalogo" AS servizio
SET "predefinito" = true
FROM "AuditLog" AS audit
WHERE audit."tenantId" = servizio."tenantId"
  AND audit.azione = 'ormeggio.servizi.predefiniti'
  AND servizio."createdAt" = (
    SELECT lotto."createdAt"
    FROM "ServizioCatalogo" AS lotto
    WHERE lotto."tenantId" = audit."tenantId"
      AND lotto."createdAt" <= audit."createdAt"
      AND lotto."createdAt" >= audit."createdAt" - INTERVAL '1 minute'
    GROUP BY lotto."createdAt"
    HAVING COUNT(*) > 1
    ORDER BY lotto."createdAt" DESC
    LIMIT 1
  );
