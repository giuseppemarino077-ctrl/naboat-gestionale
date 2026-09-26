-- CreateEnum
CREATE TYPE "TipoIntervento" AS ENUM ('assicurazione', 'revisione', 'tagliando', 'ore_motore', 'altro');

-- CreateEnum
CREATE TYPE "TariffaTipo" AS ENUM ('mezza_giornata', 'giornata', 'settimana');

-- CreateEnum
CREATE TYPE "TariffaStagione" AS ENUM ('alta', 'bassa', 'tutto_anno');

-- AlterTable
ALTER TABLE "Boat" ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lon" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "logoUrl" TEXT;

-- CreateTable
CREATE TABLE "Maintenance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "boatId" TEXT NOT NULL,
    "tipo" "TipoIntervento" NOT NULL DEFAULT 'altro',
    "titolo" TEXT NOT NULL,
    "dataScadenza" TIMESTAMP(3),
    "oreMotore" INTEGER,
    "eseguitoAt" TIMESTAMP(3),
    "costoCent" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tariffa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "boatId" TEXT,
    "tipo" "TariffaTipo" NOT NULL,
    "stagione" "TariffaStagione" NOT NULL DEFAULT 'tutto_anno',
    "prezzoCent" INTEGER NOT NULL,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tariffa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Maintenance_tenantId_dataScadenza_idx" ON "Maintenance"("tenantId", "dataScadenza");

-- CreateIndex
CREATE INDEX "Maintenance_boatId_idx" ON "Maintenance"("boatId");

-- CreateIndex
CREATE INDEX "Tariffa_tenantId_tipo_stagione_idx" ON "Tariffa"("tenantId", "tipo", "stagione");

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Maintenance" ADD CONSTRAINT "Maintenance_boatId_fkey" FOREIGN KEY ("boatId") REFERENCES "Boat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tariffa" ADD CONSTRAINT "Tariffa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tariffa" ADD CONSTRAINT "Tariffa_boatId_fkey" FOREIGN KEY ("boatId") REFERENCES "Boat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

