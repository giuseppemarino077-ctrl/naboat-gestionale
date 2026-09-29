-- T05: indici per liste e calendario (query filtrate per azienda e ordinate per data).
-- Booking: elenco prenotazioni e finestre del calendario (WHERE tenantId + ORDER BY startAt).
CREATE INDEX IF NOT EXISTS "Booking_tenantId_startAt_idx" ON "Booking"("tenantId", "startAt");
-- Customer: elenco clienti (WHERE tenantId + ORDER BY createdAt DESC).
CREATE INDEX IF NOT EXISTS "Customer_tenantId_createdAt_idx" ON "Customer"("tenantId", "createdAt");
