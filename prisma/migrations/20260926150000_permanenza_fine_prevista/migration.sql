-- La sosta con fine prevista libera il posto a quella data; una sosta senza fine
-- lo impegna finché non viene chiusa. Il vincolo precedente usava solo fineAt,
-- ignorando finePrevistaAt: qui si allinea al brief.
ALTER TABLE "Permanenza" DROP CONSTRAINT IF EXISTS "permanenza_posto_senza_sovrapposizioni";
ALTER TABLE "Permanenza" DROP CONSTRAINT IF EXISTS "permanenza_barca_senza_sovrapposizioni";

ALTER TABLE "Permanenza"
  ADD CONSTRAINT "permanenza_posto_senza_sovrapposizioni"
  EXCLUDE USING gist (
    "postoId" WITH =,
    tsrange("inizioAt", COALESCE("fineAt", "finePrevistaAt", 'infinity'::timestamp), '[)') WITH &&
  )
  WHERE (stato = 'attiva');

ALTER TABLE "Permanenza"
  ADD CONSTRAINT "permanenza_barca_senza_sovrapposizioni"
  EXCLUDE USING gist (
    "boatId" WITH =,
    tsrange("inizioAt", COALESCE("fineAt", "finePrevistaAt", 'infinity'::timestamp), '[)') WITH &&
  )
  WHERE (stato = 'attiva');
