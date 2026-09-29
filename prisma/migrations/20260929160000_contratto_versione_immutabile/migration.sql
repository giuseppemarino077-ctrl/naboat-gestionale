-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "contrattoCreatoAt" TIMESTAMP(3),
ADD COLUMN     "contrattoHash" TEXT,
ADD COLUMN     "contrattoSnapshot" JSONB,
ADD COLUMN     "contrattoVersione" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ContrattoOrmeggio" ADD COLUMN     "hash" TEXT,
ADD COLUMN     "versione" INTEGER NOT NULL DEFAULT 1;
