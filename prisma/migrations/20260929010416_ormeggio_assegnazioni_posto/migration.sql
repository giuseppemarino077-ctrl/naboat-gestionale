-- CreateTable
CREATE TABLE "AssegnazionePosto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "permanenzaId" TEXT NOT NULL,
    "postoId" TEXT NOT NULL,
    "boatId" TEXT NOT NULL,
    "dal" TIMESTAMP(3) NOT NULL,
    "al" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssegnazionePosto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssegnazionePosto_tenantId_dal_idx" ON "AssegnazionePosto"("tenantId", "dal");

-- CreateIndex
CREATE INDEX "AssegnazionePosto_permanenzaId_idx" ON "AssegnazionePosto"("permanenzaId");

-- CreateIndex
CREATE INDEX "AssegnazionePosto_postoId_idx" ON "AssegnazionePosto"("postoId");

-- CreateIndex
CREATE INDEX "AssegnazionePosto_boatId_idx" ON "AssegnazionePosto"("boatId");

-- AddForeignKey
ALTER TABLE "AssegnazionePosto" ADD CONSTRAINT "AssegnazionePosto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssegnazionePosto" ADD CONSTRAINT "AssegnazionePosto_permanenzaId_fkey" FOREIGN KEY ("permanenzaId") REFERENCES "Permanenza"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssegnazionePosto" ADD CONSTRAINT "AssegnazionePosto_postoId_fkey" FOREIGN KEY ("postoId") REFERENCES "Posto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssegnazionePosto" ADD CONSTRAINT "AssegnazionePosto_boatId_fkey" FOREIGN KEY ("boatId") REFERENCES "Boat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: ogni permanenza esistente diventa un'assegnazione [inizio, fine).
-- La storia degli spostamenti fatti prima di questa migrazione non è nota, quindi
-- si usa il posto corrente; da qui in avanti gli spostamenti scrivono gli intervalli.
INSERT INTO "AssegnazionePosto" ("id", "tenantId", "permanenzaId", "postoId", "boatId", "dal", "al", "createdAt")
SELECT
  gen_random_uuid(),
  p."tenantId",
  p."id",
  p."postoId",
  p."boatId",
  p."inizioAt",
  CASE
    WHEN COALESCE(p."fineAt", p."finePrevistaAt") IS NULL THEN NULL
    WHEN COALESCE(p."fineAt", p."finePrevistaAt") > p."inizioAt" THEN COALESCE(p."fineAt", p."finePrevistaAt")
    ELSE NULL
  END,
  p."createdAt"
FROM "Permanenza" p;

-- Diagnostica di sola lettura (non cancella nulla): se esistono sovrapposizioni
-- storiche si interrompe la migrazione segnalandole, così un umano decide.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT 1
    FROM "AssegnazionePosto" a
    JOIN "AssegnazionePosto" b
      ON a."postoId" = b."postoId" AND a."id" < b."id"
     AND tsrange(a."dal", COALESCE(a."al", 'infinity'::timestamp), '[)')
      && tsrange(b."dal", COALESCE(b."al", 'infinity'::timestamp), '[)')
  ) x;
  IF n > 0 THEN
    RAISE EXCEPTION 'AssegnazionePosto: % sovrapposizioni per posto. Correggere i dati prima di applicare la migrazione.', n;
  END IF;
  SELECT count(*) INTO n FROM (
    SELECT 1
    FROM "AssegnazionePosto" a
    JOIN "AssegnazionePosto" b
      ON a."boatId" = b."boatId" AND a."id" < b."id"
     AND tsrange(a."dal", COALESCE(a."al", 'infinity'::timestamp), '[)')
      && tsrange(b."dal", COALESCE(b."al", 'infinity'::timestamp), '[)')
  ) x;
  IF n > 0 THEN
    RAISE EXCEPTION 'AssegnazionePosto: % sovrapposizioni per barca. Correggere i dati prima di applicare la migrazione.', n;
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Nessuna doppia assegnazione dello stesso posto, in qualunque momento storico.
ALTER TABLE "AssegnazionePosto"
  ADD CONSTRAINT "assegnazione_posto_senza_sovrapposizioni"
  EXCLUDE USING gist (
    "postoId" WITH =,
    tsrange("dal", COALESCE("al", 'infinity'::timestamp), '[)') WITH &&
  );

-- La stessa barca non può stare in due posti contemporaneamente.
ALTER TABLE "AssegnazionePosto"
  ADD CONSTRAINT "assegnazione_barca_senza_sovrapposizioni"
  EXCLUDE USING gist (
    "boatId" WITH =,
    tsrange("dal", COALESCE("al", 'infinity'::timestamp), '[)') WITH &&
  );
