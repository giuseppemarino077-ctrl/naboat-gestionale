-- CreateTable
CREATE TABLE "OperazioneCondivisa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chiave" TEXT NOT NULL,
    "impronta" TEXT NOT NULL,
    "risposta" JSONB NOT NULL,
    "status" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperazioneCondivisa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperazioneCondivisa_createdAt_idx" ON "OperazioneCondivisa"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperazioneCondivisa_tenantId_userId_chiave_key" ON "OperazioneCondivisa"("tenantId", "userId", "chiave");

