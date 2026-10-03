-- AlterTable
ALTER TABLE "Boat" ADD COLUMN     "esperienze" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "esperienzePersonalizzate" TEXT[] DEFAULT ARRAY[]::TEXT[];
