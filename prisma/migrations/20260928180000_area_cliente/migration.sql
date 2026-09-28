-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "clienteAccountId" TEXT;

-- AlterTable
ALTER TABLE "Recensione" ADD COLUMN     "clienteAccountId" TEXT;

-- CreateTable
CREATE TABLE "ClienteAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefono" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifyToken" TEXT,
    "verifyExpires" TIMESTAMP(3),
    "resetToken" TEXT,
    "resetExpires" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClienteAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PatenteNautica" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "numeroCifrato" TEXT NOT NULL,
    "fotoUrl" TEXT NOT NULL,
    "stato" TEXT NOT NULL DEFAULT 'in_verifica',
    "motivoRifiuto" TEXT,
    "verificataAt" TIMESTAMP(3),
    "verificatoDa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatenteNautica_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClienteAccount_email_key" ON "ClienteAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ClienteAccount_verifyToken_key" ON "ClienteAccount"("verifyToken");

-- CreateIndex
CREATE UNIQUE INDEX "ClienteAccount_resetToken_key" ON "ClienteAccount"("resetToken");

-- CreateIndex
CREATE UNIQUE INDEX "PatenteNautica_accountId_key" ON "PatenteNautica"("accountId");

-- CreateIndex
CREATE INDEX "PatenteNautica_stato_idx" ON "PatenteNautica"("stato");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_clienteAccountId_fkey" FOREIGN KEY ("clienteAccountId") REFERENCES "ClienteAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recensione" ADD CONSTRAINT "Recensione_clienteAccountId_fkey" FOREIGN KEY ("clienteAccountId") REFERENCES "ClienteAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatenteNautica" ADD CONSTRAINT "PatenteNautica_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ClienteAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

