-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "esperienzeAttive" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "esperienzePersonalizzate" TEXT[] DEFAULT ARRAY[]::TEXT[];
