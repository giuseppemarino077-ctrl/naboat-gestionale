-- AlterTable
ALTER TABLE "Boat" ADD COLUMN     "fotoCopertina" TEXT,
ADD COLUMN     "fotoGallery" TEXT[] DEFAULT ARRAY[]::TEXT[];
