-- AlterTable
ALTER TABLE "Block" ADD COLUMN     "maintenanceId" TEXT;

-- AlterTable
ALTER TABLE "Boat" ADD COLUMN     "pagamentiOnline" TEXT NOT NULL DEFAULT 'eredita';

-- AlterTable
ALTER TABLE "Porto" ADD COLUMN     "placeId" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "sedeOperativaLat" DOUBLE PRECISION,
ADD COLUMN     "sedeOperativaLon" DOUBLE PRECISION,
ADD COLUMN     "sedeOperativaNome" TEXT,
ADD COLUMN     "sedeOperativaPlaceId" TEXT;

-- Normalizzazione dei telefoni esistenti al formato canonico E.164 (+39 per i
-- numeri nazionali italiani). Non confronta solo le ultime cifre e conserva gli
-- zeri significativi. I valori non numerici/ambigui restano invariati e verranno
-- riportati separatamente.
UPDATE "Customer"
SET "telefono" = CASE
  WHEN "telefono" IS NULL OR btrim("telefono") = '' THEN NULL
  WHEN btrim("telefono") LIKE '+%' THEN '+' || regexp_replace("telefono", '[^0-9]', '', 'g')
  WHEN btrim("telefono") LIKE '00%' THEN '+' || regexp_replace(substr(regexp_replace("telefono", '[^0-9]', '', 'g'), 3), '[^0-9]', '', 'g')
  WHEN length(regexp_replace("telefono", '[^0-9]', '', 'g')) >= 11
       AND regexp_replace("telefono", '[^0-9]', '', 'g') LIKE '39%'
    THEN '+' || regexp_replace("telefono", '[^0-9]', '', 'g')
  WHEN length(regexp_replace("telefono", '[^0-9]', '', 'g')) BETWEEN 8 AND 15
    THEN '+' || '39' || regexp_replace("telefono", '[^0-9]', '', 'g')
  ELSE "telefono"
END;

-- dedupKey canonica = telefono canonico per i vecchi recapiti numerici.
UPDATE "Customer"
SET "dedupKey" = "telefono"
WHERE "telefono" IS NOT NULL AND "dedupKey" ~ '^[0-9]+$';

-- Duplicati sullo stesso numero nella stessa azienda: si conserva la scheda più
-- vecchia; le altre diventano clienti senza telefono (nessuna cancellazione,
-- prenotazioni e storico restano collegati all'anagrafica originale).
WITH d AS (
  SELECT id, row_number() OVER (PARTITION BY "tenantId", "telefono" ORDER BY "createdAt", id) AS rn
  FROM "Customer" WHERE "telefono" IS NOT NULL
)
UPDATE "Customer" c
SET "telefono" = NULL,
    "dedupKey" = 'n:' || lower(c."nome") || ':' || c.id
FROM d WHERE c.id = d.id AND d.rn > 1;

-- Eventuali collisioni residue sulla chiave di deduplica si risolvono con un suffisso.
WITH d AS (
  SELECT id, row_number() OVER (PARTITION BY "tenantId", "dedupKey" ORDER BY "createdAt", id) AS rn
  FROM "Customer"
)
UPDATE "Customer" c
SET "dedupKey" = c."dedupKey" || ':' || c.id
FROM d WHERE c.id = d.id AND d.rn > 1;

-- CreateIndex
CREATE UNIQUE INDEX "Block_maintenanceId_key" ON "Block"("maintenanceId");

-- CreateIndex
CREATE INDEX "Block_maintenanceId_idx" ON "Block"("maintenanceId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tenantId_telefono_key" ON "Customer"("tenantId", "telefono");

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "Maintenance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
