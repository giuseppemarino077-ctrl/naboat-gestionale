ALTER TABLE "Attivita" ADD COLUMN "priorita" SMALLINT NOT NULL DEFAULT 2;
ALTER TABLE "Attivita" ADD CONSTRAINT "attivita_priorita_valida" CHECK ("priorita" BETWEEN 1 AND 3);
