-- CreateEnum
CREATE TYPE "ExpenseCategoria" AS ENUM ('carburante', 'manutenzione', 'skipper', 'assicurazione', 'ormeggio', 'pulizia', 'commissioni', 'altro');

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "boatId" TEXT,
    "categoria" "ExpenseCategoria" NOT NULL DEFAULT 'altro',
    "descrizione" TEXT NOT NULL,
    "importoCent" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "creatoDa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_tenantId_data_idx" ON "Expense"("tenantId", "data");

-- CreateIndex
CREATE INDEX "Expense_boatId_idx" ON "Expense"("boatId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_boatId_fkey" FOREIGN KEY ("boatId") REFERENCES "Boat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

