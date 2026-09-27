-- Reset password: token monouso con scadenza
ALTER TABLE "User" ADD COLUMN "resetToken" TEXT;
ALTER TABLE "User" ADD COLUMN "resetExpires" TIMESTAMP(3);

-- Versione di sessione: incrementandola si invalidano i gettoni gia emessi
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "User_resetToken_key" ON "User"("resetToken");
