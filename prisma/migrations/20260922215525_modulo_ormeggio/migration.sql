-- CreateEnum
CREATE TYPE "TipoModulo" AS ENUM ('noleggio', 'ormeggio', 'entrambi');

-- CreateEnum
CREATE TYPE "UsoBarca" AS ENUM ('noleggio', 'custodia');

-- CreateEnum
CREATE TYPE "PermanenzaStato" AS ENUM ('attiva', 'chiusa');

-- CreateEnum
CREATE TYPE "MovimentoTipo" AS ENUM ('uscita_programmata', 'uscita', 'rientro', 'trasferimento');

-- CreateEnum
CREATE TYPE "AttivitaStato" AS ENUM ('da_fare', 'in_corso', 'completato');

-- CreateEnum
CREATE TYPE "AddebitoOrigine" AS ENUM ('custodia', 'servizio', 'carburante', 'altro');

-- CreateEnum
CREATE TYPE "AddebitoStato" AS ENUM ('da_pagare', 'pagato');

-- CreateEnum
CREATE TYPE "ContrattoOrmeggioTipo" AS ENUM ('ormeggio_custodia', 'rimessaggio_custodia');

-- AlterTable
ALTER TABLE "Boat" ADD COLUMN     "uso" "UsoBarca" NOT NULL DEFAULT 'noleggio';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "permanenzaId" TEXT;

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "canoneOrmeggioMensileCent" INTEGER,
ADD COLUMN     "prezzoAttivazioneOrmeggioCent" INTEGER;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "moduloOrmeggio" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tipoModulo" "TipoModulo" NOT NULL DEFAULT 'noleggio';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "vedeImporti" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "righe" INTEGER NOT NULL DEFAULT 1,
    "colonne" INTEGER NOT NULL DEFAULT 1,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Posto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "riga" INTEGER NOT NULL,
    "colonna" INTEGER NOT NULL,
    "codice" TEXT NOT NULL,
    "bloccato" BOOLEAN NOT NULL DEFAULT false,
    "lunghezzaMaxCm" INTEGER,
    "larghezzaMaxCm" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Posto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permanenza" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "boatId" TEXT NOT NULL,
    "postoId" TEXT NOT NULL,
    "tipo" "ContrattoOrmeggioTipo" NOT NULL DEFAULT 'ormeggio_custodia',
    "inizioAt" TIMESTAMP(3) NOT NULL,
    "finePrevistaAt" TIMESTAMP(3),
    "fineAt" TIMESTAMP(3),
    "stato" "PermanenzaStato" NOT NULL DEFAULT 'attiva',
    "corrispettivoCent" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permanenza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movimento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "permanenzaId" TEXT NOT NULL,
    "boatId" TEXT NOT NULL,
    "tipo" "MovimentoTipo" NOT NULL,
    "previstoAt" TIMESTAMP(3),
    "effettivoAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attivita" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "permanenzaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataPrevista" TIMESTAMP(3),
    "stato" "AttivitaStato" NOT NULL DEFAULT 'da_fare',
    "quantita" DOUBLE PRECISION,
    "unita" TEXT,
    "prezzoCent" INTEGER,
    "addettoId" TEXT,
    "incluso" BOOLEAN NOT NULL DEFAULT false,
    "completatoAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attivita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServizioCatalogo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "prezzoCent" INTEGER,
    "unita" TEXT,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServizioCatalogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Addebito" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "permanenzaId" TEXT NOT NULL,
    "descrizione" TEXT NOT NULL,
    "importoCent" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origine" "AddebitoOrigine" NOT NULL DEFAULT 'altro',
    "stato" "AddebitoStato" NOT NULL DEFAULT 'da_pagare',
    "attivitaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Addebito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContrattoOrmeggio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "permanenzaId" TEXT NOT NULL,
    "tipo" "ContrattoOrmeggioTipo" NOT NULL,
    "token" TEXT NOT NULL,
    "testoSnapshot" JSONB,
    "richiestoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firmatoAt" TIMESTAMP(3),
    "firmaNome" TEXT,
    "firmaIp" TEXT,

    CONSTRAINT "ContrattoOrmeggio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Area_tenantId_idx" ON "Area"("tenantId");

-- CreateIndex
CREATE INDEX "Posto_tenantId_idx" ON "Posto"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Posto_areaId_riga_colonna_key" ON "Posto"("areaId", "riga", "colonna");

-- CreateIndex
CREATE INDEX "Permanenza_tenantId_stato_idx" ON "Permanenza"("tenantId", "stato");

-- CreateIndex
CREATE INDEX "Permanenza_boatId_idx" ON "Permanenza"("boatId");

-- CreateIndex
CREATE INDEX "Permanenza_postoId_idx" ON "Permanenza"("postoId");

-- CreateIndex
CREATE INDEX "Movimento_tenantId_effettivoAt_idx" ON "Movimento"("tenantId", "effettivoAt");

-- CreateIndex
CREATE INDEX "Movimento_permanenzaId_idx" ON "Movimento"("permanenzaId");

-- CreateIndex
CREATE INDEX "Attivita_tenantId_dataPrevista_idx" ON "Attivita"("tenantId", "dataPrevista");

-- CreateIndex
CREATE INDEX "Attivita_permanenzaId_idx" ON "Attivita"("permanenzaId");

-- CreateIndex
CREATE INDEX "ServizioCatalogo_tenantId_idx" ON "ServizioCatalogo"("tenantId");

-- CreateIndex
CREATE INDEX "Addebito_tenantId_data_idx" ON "Addebito"("tenantId", "data");

-- CreateIndex
CREATE INDEX "Addebito_permanenzaId_idx" ON "Addebito"("permanenzaId");

-- CreateIndex
CREATE UNIQUE INDEX "ContrattoOrmeggio_permanenzaId_key" ON "ContrattoOrmeggio"("permanenzaId");

-- CreateIndex
CREATE UNIQUE INDEX "ContrattoOrmeggio_token_key" ON "ContrattoOrmeggio"("token");

-- CreateIndex
CREATE INDEX "ContrattoOrmeggio_tenantId_idx" ON "ContrattoOrmeggio"("tenantId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_permanenzaId_fkey" FOREIGN KEY ("permanenzaId") REFERENCES "Permanenza"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posto" ADD CONSTRAINT "Posto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Posto" ADD CONSTRAINT "Posto_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permanenza" ADD CONSTRAINT "Permanenza_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permanenza" ADD CONSTRAINT "Permanenza_boatId_fkey" FOREIGN KEY ("boatId") REFERENCES "Boat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permanenza" ADD CONSTRAINT "Permanenza_postoId_fkey" FOREIGN KEY ("postoId") REFERENCES "Posto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimento" ADD CONSTRAINT "Movimento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movimento" ADD CONSTRAINT "Movimento_permanenzaId_fkey" FOREIGN KEY ("permanenzaId") REFERENCES "Permanenza"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attivita" ADD CONSTRAINT "Attivita_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attivita" ADD CONSTRAINT "Attivita_permanenzaId_fkey" FOREIGN KEY ("permanenzaId") REFERENCES "Permanenza"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attivita" ADD CONSTRAINT "Attivita_addettoId_fkey" FOREIGN KEY ("addettoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServizioCatalogo" ADD CONSTRAINT "ServizioCatalogo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Addebito" ADD CONSTRAINT "Addebito_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Addebito" ADD CONSTRAINT "Addebito_permanenzaId_fkey" FOREIGN KEY ("permanenzaId") REFERENCES "Permanenza"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContrattoOrmeggio" ADD CONSTRAINT "ContrattoOrmeggio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContrattoOrmeggio" ADD CONSTRAINT "ContrattoOrmeggio_permanenzaId_fkey" FOREIGN KEY ("permanenzaId") REFERENCES "Permanenza"("id") ON DELETE CASCADE ON UPDATE CASCADE;
