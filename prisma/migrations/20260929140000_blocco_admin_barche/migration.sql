-- Moderazione NaBoat separata dalla scelta editoriale del noleggiatore.
-- Una barca bloccata dall'admin non entra nel catalogo anche se il proprietario
-- la lascia pubblicata, e il proprietario non può sbloccarla da solo.
ALTER TABLE "Boat"
ADD COLUMN     "bloccataAdmin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "motivoBlocco" TEXT,
ADD COLUMN     "bloccataAt" TIMESTAMP(3),
ADD COLUMN     "bloccataDa" TEXT;
