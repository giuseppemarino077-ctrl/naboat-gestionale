-- AlterTable
ALTER TABLE "Boat" ADD COLUMN     "cabine" INTEGER,
ADD COLUMN     "carburante" TEXT,
ADD COLUMN     "cauzioneCent" INTEGER,
ADD COLUMN     "descrizione" TEXT,
ADD COLUMN     "dotazioni" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "etaMinima" INTEGER,
ADD COLUMN     "inPausa" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lunghezzaM" DOUBLE PRECISION,
ADD COLUMN     "modelloId" TEXT,
ADD COLUMN     "portoId" TEXT,
ADD COLUMN     "pubblicata" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "finestraRecensioniGiorni" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "pianoFreeMaxBarche" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "pianoFreeMaxFoto" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "pianoProPrezzoAnnualeCent" INTEGER,
ADD COLUMN     "pianoProPrezzoMensileCent" INTEGER,
ADD COLUMN     "pianoProvaGiorni" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sogliaPatenteCv" INTEGER NOT NULL DEFAULT 40,
ADD COLUMN     "tempoPreparazioneMin" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RichiestaContatto" ADD COLUMN     "tipo" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "annoFondazione" INTEGER,
ADD COLUMN     "citta" TEXT,
ADD COLUMN     "copertinaUrl" TEXT,
ADD COLUMN     "descrizione" TEXT,
ADD COLUMN     "lingue" TEXT,
ADD COLUMN     "mostraChiSiamo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mostraEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mostraPorti" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mostraRecensioni" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mostraSocial" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mostraTelefono" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "orarioImbarco" TEXT,
ADD COLUMN     "orarioRientro" TEXT,
ADD COLUMN     "pianoScadenzaAt" TIMESTAMP(3),
ADD COLUMN     "pianoTipo" TEXT NOT NULL DEFAULT 'free',
ADD COLUMN     "politicaCancellazione" TEXT,
ADD COLUMN     "sito" TEXT,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "social" TEXT,
ADD COLUMN     "verificata" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Porto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "indirizzo" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "note" TEXT,
    "orari" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Porto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelloBarca" (
    "id" TEXT NOT NULL,
    "marca" TEXT,
    "modello" TEXT NOT NULL,
    "tipo" TEXT,
    "capienza" INTEGER,
    "lunghezzaM" DOUBLE PRECISION,
    "potenzaCv" INTEGER,
    "cabine" INTEGER,
    "dotazioni" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stato" TEXT NOT NULL DEFAULT 'in_verifica',
    "creatoDaTenantId" TEXT,
    "verificatoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelloBarca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recensione" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "customerId" TEXT,
    "voto" INTEGER NOT NULL,
    "commento" TEXT,
    "risposta" TEXT,
    "rispostaAt" TIMESTAMP(3),
    "stato" TEXT NOT NULL DEFAULT 'pubblicata',
    "moderazioneMotivo" TEXT,
    "moderataAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recensione_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Porto_tenantId_idx" ON "Porto"("tenantId");

-- CreateIndex
CREATE INDEX "ModelloBarca_stato_idx" ON "ModelloBarca"("stato");

-- CreateIndex
CREATE INDEX "ModelloBarca_creatoDaTenantId_idx" ON "ModelloBarca"("creatoDaTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Recensione_bookingId_key" ON "Recensione"("bookingId");

-- CreateIndex
CREATE INDEX "Recensione_tenantId_stato_idx" ON "Recensione"("tenantId", "stato");

-- CreateIndex
CREATE INDEX "Boat_portoId_idx" ON "Boat"("portoId");

-- CreateIndex
CREATE INDEX "Boat_modelloId_idx" ON "Boat"("modelloId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- AddForeignKey
ALTER TABLE "Boat" ADD CONSTRAINT "Boat_portoId_fkey" FOREIGN KEY ("portoId") REFERENCES "Porto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boat" ADD CONSTRAINT "Boat_modelloId_fkey" FOREIGN KEY ("modelloId") REFERENCES "ModelloBarca"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Porto" ADD CONSTRAINT "Porto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recensione" ADD CONSTRAINT "Recensione_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recensione" ADD CONSTRAINT "Recensione_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

