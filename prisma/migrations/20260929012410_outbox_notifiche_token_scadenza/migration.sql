-- CreateEnum
CREATE TYPE "NotificaStato" AS ENUM ('da_inviare', 'inviata', 'errore');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "contrattoTokenExpires" TIMESTAMP(3),
ADD COLUMN     "contrattoTokenVersione" INTEGER;

-- AlterTable
ALTER TABLE "ContrattoOrmeggio" ADD COLUMN     "tokenExpires" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Notifica" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "evento" TEXT NOT NULL,
    "destinatario" TEXT NOT NULL,
    "oggetto" TEXT NOT NULL,
    "testo" TEXT NOT NULL,
    "html" TEXT,
    "stato" "NotificaStato" NOT NULL DEFAULT 'da_inviare',
    "tentativi" INTEGER NOT NULL DEFAULT 0,
    "dedupKey" TEXT,
    "errore" TEXT,
    "creatoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviataAt" TIMESTAMP(3),
    "ultimoTentativoAt" TIMESTAMP(3),

    CONSTRAINT "Notifica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notifica_dedupKey_key" ON "Notifica"("dedupKey");

-- CreateIndex
CREATE INDEX "Notifica_tenantId_stato_idx" ON "Notifica"("tenantId", "stato");

-- CreateIndex
CREATE INDEX "Notifica_stato_creatoAt_idx" ON "Notifica"("stato", "creatoAt");
