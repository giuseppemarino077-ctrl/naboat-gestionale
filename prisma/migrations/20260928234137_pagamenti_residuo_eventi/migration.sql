-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "condizioniSnapshot" JSONB,
ADD COLUMN     "origineCanale" TEXT;

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "tenantId" TEXT,
    "tipo" TEXT NOT NULL,
    "stato" TEXT NOT NULL DEFAULT 'ricevuto',
    "motivo" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "elaboratoAt" TIMESTAMP(3),

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StripeEvent_eventId_key" ON "StripeEvent"("eventId");

-- CreateIndex
CREATE INDEX "StripeEvent_tenantId_createdAt_idx" ON "StripeEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "StripeEvent_stato_idx" ON "StripeEvent"("stato");
