-- CreateEnum
CREATE TYPE "SeoTipo" AS ENUM ('piattaforma', 'azienda', 'barca', 'skipper');

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "seoAnalyticsId" TEXT,
ADD COLUMN     "seoDescrizioneDefault" TEXT,
ADD COLUMN     "seoDominioPubblico" TEXT,
ADD COLUMN     "seoImmagineDefault" TEXT,
ADD COLUMN     "seoKeywordsDefault" TEXT,
ADD COLUMN     "seoLocalitaDefault" TEXT,
ADD COLUMN     "seoPubblicheAttive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seoTitoloDefault" TEXT,
ADD COLUMN     "seoVerificaGoogle" TEXT;

-- CreateTable
CREATE TABLE "SeoPage" (
    "id" TEXT NOT NULL,
    "tipo" "SeoTipo" NOT NULL,
    "refId" TEXT,
    "tenantId" TEXT,
    "slug" TEXT,
    "pubblica" BOOLEAN NOT NULL DEFAULT false,
    "titoloAuto" TEXT,
    "descrizioneAuto" TEXT,
    "keywordsAuto" TEXT,
    "titolo" TEXT,
    "descrizione" TEXT,
    "keywords" TEXT,
    "immagine" TEXT,
    "noindex" BOOLEAN NOT NULL DEFAULT false,
    "aggiornatoAt" TIMESTAMP(3) NOT NULL,
    "creatoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeoPage_slug_key" ON "SeoPage"("slug");

-- CreateIndex
CREATE INDEX "SeoPage_tenantId_idx" ON "SeoPage"("tenantId");

-- CreateIndex
CREATE INDEX "SeoPage_pubblica_idx" ON "SeoPage"("pubblica");

-- CreateIndex
CREATE UNIQUE INDEX "SeoPage_tipo_refId_key" ON "SeoPage"("tipo", "refId");

