-- AlterTable
ALTER TABLE "Boat" ADD COLUMN     "archiviato" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "BookingExtra" ADD COLUMN     "quantita" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Extra" ADD COLUMN     "boatIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "quantitaMax" INTEGER,
ADD COLUMN     "unita" TEXT NOT NULL DEFAULT 'noleggio';

