-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "preventivoSnapshot" JSONB,
ADD COLUMN     "prezzoDaDefinire" BOOLEAN NOT NULL DEFAULT false;
