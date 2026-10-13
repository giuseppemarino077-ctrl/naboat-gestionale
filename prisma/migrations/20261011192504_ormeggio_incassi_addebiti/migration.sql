-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "addebitoId" TEXT;

-- CreateIndex
CREATE INDEX "Payment_tenantId_permanenzaId_idx" ON "Payment"("tenantId", "permanenzaId");

-- CreateIndex
CREATE INDEX "Payment_addebitoId_idx" ON "Payment"("addebitoId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_addebitoId_fkey" FOREIGN KEY ("addebitoId") REFERENCES "Addebito"("id") ON DELETE SET NULL ON UPDATE CASCADE;
