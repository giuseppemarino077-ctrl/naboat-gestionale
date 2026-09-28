-- Le richieste da confermare occupano la barca come le prenotazioni confermate,
-- finché non vengono rifiutate o cancellate. Si aggiorna il trigger di integrità.
CREATE OR REPLACE FUNCTION check_booking_no_overlap() RETURNS trigger AS $$
BEGIN
  IF NEW.stato IN ('da_confermare', 'prenotata', 'in_mare') AND EXISTS (
    SELECT 1 FROM "Booking"
    WHERE "boatId" = NEW."boatId"
      AND id <> NEW.id
      AND stato IN ('da_confermare', 'prenotata', 'in_mare')
      AND "startAt" < NEW."endAt"
      AND "endAt" > NEW."startAt"
  ) THEN
    RAISE EXCEPTION 'Sovrapposizione prenotazione per questa barca';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
