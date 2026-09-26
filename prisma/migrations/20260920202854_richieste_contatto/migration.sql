-- CreateTable
CREATE TABLE "RichiestaContatto" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "privacyAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "lettoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RichiestaContatto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RichiestaContatto_createdAt_idx" ON "RichiestaContatto"("createdAt");
