-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "loginImmagine" TEXT,
ADD COLUMN     "loginMessaggio" TEXT,
ADD COLUMN     "loginSfocatura" INTEGER NOT NULL DEFAULT 0;

