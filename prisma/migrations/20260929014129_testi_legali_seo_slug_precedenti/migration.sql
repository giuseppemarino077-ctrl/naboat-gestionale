-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "legaleAggiornatoAt" TIMESTAMP(3),
ADD COLUMN     "legaleCookieTesto" TEXT,
ADD COLUMN     "legalePrivacyTesto" TEXT,
ADD COLUMN     "legaleTerminiTesto" TEXT,
ADD COLUMN     "legaleVersione" TEXT;

-- AlterTable
ALTER TABLE "SeoPage" ADD COLUMN     "slugPrecedenti" TEXT[] DEFAULT ARRAY[]::TEXT[];
