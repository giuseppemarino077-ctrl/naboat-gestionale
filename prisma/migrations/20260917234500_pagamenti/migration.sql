-- CreateEnum
CREATE TYPE "PaymentStato" AS ENUM ('in_attesa', 'pagato', 'fallito', 'rimborsato', 'rimborsato_parziale');

-- CreateEnum
CREATE TYPE "PaymentTipo" AS ENUM ('acconto', 'saldo', 'totale');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "origineCanale" TEXT NOT NULL DEFAULT 'diretto',
ADD COLUMN     "payToken" TEXT,
ADD COLUMN     "payTokenExpires" TIMESTAMP(3),
ADD COLUMN     "prezzoCent" INTEGER;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "accontoPct" DOUBLE PRECISION NOT NULL DEFAULT 30,
ADD COLUMN     "feeNaboatPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "feeProviderFixedCent" INTEGER NOT NULL DEFAULT 25,
ADD COLUMN     "feeProviderPct" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
ADD COLUMN     "pagamentiAttivi" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pagamentiBloccatiNaBoat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paypalAttivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rimborsoOreMinime" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "rimborsoPct" DOUBLE PRECISION NOT NULL DEFAULT 50,
ADD COLUMN     "stripeAttivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripePublicKey" TEXT,
ADD COLUMN     "stripeSecretEnc" TEXT,
ADD COLUMN     "stripeWebhookEnc" TEXT;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookingId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "tipo" "PaymentTipo" NOT NULL DEFAULT 'acconto',
    "importoCent" INTEGER NOT NULL,
    "feeNaboatCent" INTEGER NOT NULL DEFAULT 0,
    "feeProviderCent" INTEGER NOT NULL DEFAULT 0,
    "totaleCent" INTEGER NOT NULL,
    "valuta" TEXT NOT NULL DEFAULT 'eur',
    "stato" "PaymentStato" NOT NULL DEFAULT 'in_attesa',
    "metodo" TEXT,
    "sessionId" TEXT,
    "paymentIntentId" TEXT,
    "rimborsoCent" INTEGER NOT NULL DEFAULT 0,
    "descrizione" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_sessionId_key" ON "Payment"("sessionId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_createdAt_idx" ON "Payment"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_payToken_key" ON "Booking"("payToken");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

