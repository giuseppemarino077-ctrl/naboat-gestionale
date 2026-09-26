-- Servizi NaBoat in due aree separate: gestionale (attivazione + canone) e marketplace (fee).
-- Rinomina le colonne del listino per riflettere i nuovi concetti, mantenendo i valori esistenti.

-- 1. Listino di piattaforma
ALTER TABLE "PlatformSettings" RENAME COLUMN "prezzoMeseCent" TO "canoneMensileCent";
ALTER TABLE "PlatformSettings" DROP COLUMN "prezzoSettimanaCent";
ALTER TABLE "PlatformSettings" ADD COLUMN "prezzoAttivazioneCent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlatformSettings" ADD COLUMN "canoneStagionaleCent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PlatformSettings" ADD COLUMN "feeNaboatPctDefault" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 2. Condizioni commerciali per singola azienda
ALTER TABLE "Tenant" ADD COLUMN "moduloMarketplace" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN "prezzoAttivazioneCent" INTEGER;
ALTER TABLE "Tenant" ADD COLUMN "canoneMensileCent" INTEGER;
ALTER TABLE "Tenant" ADD COLUMN "canoneStagionaleCent" INTEGER;

-- 3. Il tipo di abbonamento diventa testo libero (più configurabile)
ALTER TABLE "Subscription" ALTER COLUMN "tipo" TYPE TEXT USING "tipo"::text;
DROP TYPE "SubscriptionTipo";

-- 4. Allinea i vecchi abbonamenti di prova ai nuovi nomi
UPDATE "Subscription" SET "tipo" = 'manutenzione_mensile' WHERE "tipo" IN ('mese', 'settimana');
