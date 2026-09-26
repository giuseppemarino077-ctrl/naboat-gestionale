-- AlterTable
ALTER TABLE "Boat" ADD COLUMN     "proprietarioId" TEXT;

-- CreateTable
CREATE TABLE "Proprietario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "note" TEXT,
    "dedupKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proprietario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Proprietario_tenantId_idx" ON "Proprietario"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Proprietario_tenantId_dedupKey_key" ON "Proprietario"("tenantId", "dedupKey");

-- CreateIndex
CREATE INDEX "Boat_proprietarioId_idx" ON "Boat"("proprietarioId");

-- AddForeignKey
ALTER TABLE "Boat" ADD CONSTRAINT "Boat_proprietarioId_fkey" FOREIGN KEY ("proprietarioId") REFERENCES "Proprietario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proprietario" ADD CONSTRAINT "Proprietario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
