-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "opzionePromemoriaAt" TIMESTAMP(3),
ADD COLUMN     "opzioneScadenzaAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "opzioneScadenzaOre" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "richiestaMaxAnticipoGiorni" INTEGER NOT NULL DEFAULT 730,
ADD COLUMN     "richiestaMaxDurataGiorni" INTEGER NOT NULL DEFAULT 30;

-- CreateIndex
CREATE INDEX "Booking_tenantId_stato_opzioneScadenzaAt_idx" ON "Booking"("tenantId", "stato", "opzioneScadenzaAt");

-- M05: le richieste "da_confermare" con l'opzione scaduta non occupano più la barca
-- (secondo livello, coerente con src/lib/disponibilita.ts). Le richieste storiche
-- hanno opzioneScadenzaAt NULL e continuano a occupare: nessuna scadenza retroattiva.
CREATE OR REPLACE FUNCTION check_booking_no_overlap() RETURNS trigger AS $$
BEGIN
  IF NEW.stato IN ('da_confermare', 'prenotata', 'in_mare') AND EXISTS (
    SELECT 1 FROM "Booking"
    WHERE "boatId" = NEW."boatId"
      AND id <> NEW.id
      AND stato IN ('da_confermare', 'prenotata', 'in_mare')
      AND (stato <> 'da_confermare' OR "opzioneScadenzaAt" IS NULL OR "opzioneScadenzaAt" > now())
      AND "startAt" < NEW."endAt"
      AND "endAt" > NEW."startAt"
  ) THEN
    RAISE EXCEPTION 'Sovrapposizione prenotazione per questa barca';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
