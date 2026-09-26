-- Integrità a livello DB: nessuna sovrapposizione per barca (escluse cancellate).
-- Secondo livello dopo il controllo applicativo in POST /api/v1/bookings.
-- (Usiamo un trigger: tstzrange non è IMMUTABLE e non può stare in un EXCLUDE constraint.)
CREATE OR REPLACE FUNCTION check_booking_no_overlap() RETURNS trigger AS $$
BEGIN
  IF NEW.stato <> 'cancellata' AND EXISTS (
    SELECT 1 FROM "Booking"
    WHERE "boatId" = NEW."boatId"
      AND id <> NEW.id
      AND stato IN ('prenotata', 'in_mare')
      AND "startAt" < NEW."endAt"
      AND "endAt" > NEW."startAt"
  ) THEN
    RAISE EXCEPTION 'Sovrapposizione prenotazione per questa barca';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS booking_no_overlap ON "Booking";
CREATE TRIGGER booking_no_overlap
  BEFORE INSERT OR UPDATE OF "boatId", "startAt", "endAt", "stato" ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION check_booking_no_overlap();
