-- Regola del brief: nessuna doppia assegnazione.
-- Il vincolo sta nel database, quindi vale anche se due addetti salvano nello stesso istante.
-- Lo stesso posto (e la stessa barca) non possono avere due permanenze attive sovrapposte.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Permanenza"
  ADD CONSTRAINT "permanenza_posto_senza_sovrapposizioni"
  EXCLUDE USING gist (
    "postoId" WITH =,
    tsrange("inizioAt", COALESCE("fineAt", 'infinity'::timestamp), '[)') WITH &&
  )
  WHERE (stato = 'attiva');

ALTER TABLE "Permanenza"
  ADD CONSTRAINT "permanenza_barca_senza_sovrapposizioni"
  EXCLUDE USING gist (
    "boatId" WITH =,
    tsrange("inizioAt", COALESCE("fineAt", 'infinity'::timestamp), '[)') WITH &&
  )
  WHERE (stato = 'attiva');
