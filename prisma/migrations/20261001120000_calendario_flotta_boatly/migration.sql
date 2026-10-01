-- AlterTable
ALTER TABLE "Block" ADD COLUMN     "versione" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Boat" ADD COLUMN     "codiceInterno" TEXT,
ADD COLUMN     "eliminazioneAt" TIMESTAMP(3),
ADD COLUMN     "eliminazioneRichiestaAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "capienza" DROP NOT NULL,
ALTER COLUMN "capienza" DROP DEFAULT,
ALTER COLUMN "potenzaCv" SET DATA TYPE DOUBLE PRECISION;

-- Backfill: le barche esistenti non hanno una data di aggiornamento distinta.
UPDATE "Boat" SET "updatedAt" = "createdAt";
ALTER TABLE "Boat" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "motivoRiprogrammazione" TEXT,
ADD COLUMN     "offertaId" TEXT,
ADD COLUMN     "patenteRisposta" TEXT,
ADD COLUMN     "portoId" TEXT,
ADD COLUMN     "skipperNote" TEXT,
ADD COLUMN     "skipperStato" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "sostituisceId" TEXT,
ADD COLUMN     "versione" INTEGER NOT NULL DEFAULT 1;

-- Backfill prudente dello stato skipper: un collegamento esistente significa
-- ASSIGNED; l'assenza NON viene interpretata come UNASSIGNED (poteva essere NONE).
UPDATE "Booking" SET "skipperStato" = 'ASSIGNED' WHERE "skipperId" IS NOT NULL;
-- Backfill della dichiarazione patente: solo il vecchio patenteOk=true diventa "YES".
-- patenteOk=false non prova un "No": resta ignoto (NULL).
UPDATE "Booking" SET "patenteRisposta" = 'YES' WHERE "patenteOk" = true;

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "telefono" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Extra" ADD COLUMN     "descrizione" TEXT,
ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'tutte';

-- Scope esplicito degli extra: elenco barche non vuoto = "elenco", altrimenti "tutte".
UPDATE "Extra" SET "scope" = 'elenco' WHERE cardinality("boatIds") > 0;

-- AlterTable
ALTER TABLE "Skipper" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "Tariffa" ADD COLUMN     "durataOre" DOUBLE PRECISION,
ADD COLUMN     "nomePiano" TEXT,
ADD COLUMN     "offertaId" TEXT;

-- CreateTable
CREATE TABLE "BoatOfferta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "boatId" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "attiva" BOOLEAN NOT NULL DEFAULT false,
    "skipperModo" TEXT NOT NULL DEFAULT 'NON_DISPONIBILE',
    "guidaAutonoma" BOOLEAN NOT NULL DEFAULT false,
    "etaMinima" INTEGER,
    "noteLimiti" TEXT,
    "noteRequisiti" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoatOfferta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dotazione" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'OTHER',
    "nome" TEXT NOT NULL,
    "descrizione" TEXT,
    "ordine" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dotazione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoatDotazione" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "boatId" TEXT NOT NULL,
    "dotazioneId" TEXT NOT NULL,
    "nota" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoatDotazione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtraBarca" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "extraId" TEXT NOT NULL,
    "boatId" TEXT NOT NULL,
    "prezzoCent" INTEGER,
    "quantitaMax" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtraBarca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoatOfferta_tenantId_boatId_idx" ON "BoatOfferta"("tenantId", "boatId");

-- CreateIndex
CREATE UNIQUE INDEX "BoatOfferta_boatId_codice_key" ON "BoatOfferta"("boatId", "codice");

-- CreateIndex
CREATE INDEX "Dotazione_tenantId_categoria_idx" ON "Dotazione"("tenantId", "categoria");

-- CreateIndex
CREATE UNIQUE INDEX "Dotazione_tenantId_nome_key" ON "Dotazione"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "BoatDotazione_tenantId_boatId_idx" ON "BoatDotazione"("tenantId", "boatId");

-- CreateIndex
CREATE UNIQUE INDEX "BoatDotazione_boatId_dotazioneId_key" ON "BoatDotazione"("boatId", "dotazioneId");

-- CreateIndex
CREATE INDEX "ExtraBarca_tenantId_boatId_idx" ON "ExtraBarca"("tenantId", "boatId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtraBarca_extraId_boatId_key" ON "ExtraBarca"("extraId", "boatId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_sostituisceId_key" ON "Booking"("sostituisceId");

-- CreateIndex
CREATE INDEX "Tariffa_boatId_idx" ON "Tariffa"("boatId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_offertaId_fkey" FOREIGN KEY ("offertaId") REFERENCES "BoatOfferta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_portoId_fkey" FOREIGN KEY ("portoId") REFERENCES "Porto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_sostituisceId_fkey" FOREIGN KEY ("sostituisceId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoatOfferta" ADD CONSTRAINT "BoatOfferta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoatOfferta" ADD CONSTRAINT "BoatOfferta_boatId_fkey" FOREIGN KEY ("boatId") REFERENCES "Boat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dotazione" ADD CONSTRAINT "Dotazione_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoatDotazione" ADD CONSTRAINT "BoatDotazione_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoatDotazione" ADD CONSTRAINT "BoatDotazione_boatId_fkey" FOREIGN KEY ("boatId") REFERENCES "Boat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoatDotazione" ADD CONSTRAINT "BoatDotazione_dotazioneId_fkey" FOREIGN KEY ("dotazioneId") REFERENCES "Dotazione"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraBarca" ADD CONSTRAINT "ExtraBarca_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraBarca" ADD CONSTRAINT "ExtraBarca_extraId_fkey" FOREIGN KEY ("extraId") REFERENCES "Extra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraBarca" ADD CONSTRAINT "ExtraBarca_boatId_fkey" FOREIGN KEY ("boatId") REFERENCES "Boat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tariffa" ADD CONSTRAINT "Tariffa_offertaId_fkey" FOREIGN KEY ("offertaId") REFERENCES "BoatOfferta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

