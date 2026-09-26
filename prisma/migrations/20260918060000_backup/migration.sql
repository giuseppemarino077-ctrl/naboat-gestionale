-- CreateTable
CREATE TABLE "BackupSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "ogniOre" INTEGER NOT NULL DEFAULT 24,
    "retentionCopie" INTEGER NOT NULL DEFAULT 48,
    "includiFoto" BOOLEAN NOT NULL DEFAULT true,
    "destinazioneLocale" BOOLEAN NOT NULL DEFAULT true,
    "destinazioneObjectStorage" BOOLEAN NOT NULL DEFAULT false,
    "destinazioneFtp" BOOLEAN NOT NULL DEFAULT false,
    "soloDatabase" BOOLEAN NOT NULL DEFAULT false,
    "macchinaDelTempo" BOOLEAN NOT NULL DEFAULT false,
    "replicaAttiva" BOOLEAN NOT NULL DEFAULT false,
    "replicaHost" TEXT,
    "registroCompleto" BOOLEAN NOT NULL DEFAULT true,
    "avvisoEmail" TEXT,
    "aggiornatoAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "iniziatoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finitoAt" TIMESTAMP(3),
    "esito" TEXT NOT NULL DEFAULT 'in_corso',
    "dimensioneByte" INTEGER NOT NULL DEFAULT 0,
    "file" TEXT,
    "destinazioni" TEXT NOT NULL DEFAULT '',
    "includiFoto" BOOLEAN NOT NULL DEFAULT true,
    "messaggio" TEXT,
    "settingsId" TEXT NOT NULL DEFAULT 'singleton',

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackupRun_iniziatoAt_idx" ON "BackupRun"("iniziatoAt");

-- AddForeignKey
ALTER TABLE "BackupRun" ADD CONSTRAINT "BackupRun_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "BackupSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

