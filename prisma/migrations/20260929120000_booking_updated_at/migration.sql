-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Booking" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "Booking" ALTER COLUMN "updatedAt" SET NOT NULL;
