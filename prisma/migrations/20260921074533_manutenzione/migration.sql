-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "manutenzioneAttiva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manutenzioneTesto" TEXT,
ADD COLUMN     "manutenzioneTitolo" TEXT;
