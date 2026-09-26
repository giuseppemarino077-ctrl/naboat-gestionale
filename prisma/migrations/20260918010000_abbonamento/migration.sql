-- CreateEnum
CREATE TYPE "SubscriptionTipo" AS ENUM ('settimana', 'mese');

-- CreateEnum
CREATE TYPE "SubscriptionStato" AS ENUM ('in_attesa', 'attivo', 'scaduto', 'annullato');

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "prezzoSettimanaCent" INTEGER NOT NULL DEFAULT 0,
    "prezzoMeseCent" INTEGER NOT NULL DEFAULT 0,
    "abbonamentoObbligatorio" BOOLEAN NOT NULL DEFAULT false,
    "aggiornatoAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "SubscriptionTipo" NOT NULL,
    "quantita" INTEGER NOT NULL,
    "prezzoCent" INTEGER NOT NULL,
    "inizioAt" TIMESTAMP(3) NOT NULL,
    "fineAt" TIMESTAMP(3) NOT NULL,
    "stato" "SubscriptionStato" NOT NULL DEFAULT 'in_attesa',
    "sessionId" TEXT,
    "paymentIntentId" TEXT,
    "metodo" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_sessionId_key" ON "Subscription"("sessionId");

-- CreateIndex
CREATE INDEX "Subscription_tenantId_fineAt_idx" ON "Subscription"("tenantId", "fineAt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

