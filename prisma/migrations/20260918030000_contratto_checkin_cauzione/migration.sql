-- CreateEnum
CREATE TYPE "CauzioneStato" AS ENUM ('non_richiesta', 'in_attesa', 'autorizzata', 'rilasciata', 'addebitata');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cauzioneCent" INTEGER,
ADD COLUMN     "cauzioneIntentId" TEXT,
ADD COLUMN     "cauzioneStato" "CauzioneStato" NOT NULL DEFAULT 'non_richiesta',
ADD COLUMN     "checkinAt" TIMESTAMP(3),
ADD COLUMN     "checkinCarburantePct" INTEGER,
ADD COLUMN     "checkinNote" TEXT,
ADD COLUMN     "checkoutAt" TIMESTAMP(3),
ADD COLUMN     "checkoutCarburantePct" INTEGER,
ADD COLUMN     "checkoutNote" TEXT,
ADD COLUMN     "contrattoFirmaIp" TEXT,
ADD COLUMN     "contrattoFirmaNome" TEXT,
ADD COLUMN     "contrattoFirmatoAt" TIMESTAMP(3),
ADD COLUMN     "contrattoToken" TEXT,
ADD COLUMN     "danniCent" INTEGER,
ADD COLUMN     "fotoCheckin" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "fotoCheckout" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "promemoriaInviatoAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "indirizzoPartenza" TEXT,
ADD COLUMN     "telefonoContatto" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Booking_contrattoToken_key" ON "Booking"("contrattoToken");

