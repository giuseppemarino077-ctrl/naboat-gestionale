-- Contatto della singola prenotazione (per le richieste ospiti senza anagrafica)
ALTER TABLE "Booking" ADD COLUMN "email" TEXT;

-- Link monouso per collegare una richiesta ospite all'area personale
ALTER TABLE "Booking" ADD COLUMN "clienteToken" TEXT;
ALTER TABLE "Booking" ADD COLUMN "clienteTokenExpires" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "clienteTokenUsatoAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Booking_clienteToken_key" ON "Booking"("clienteToken");
