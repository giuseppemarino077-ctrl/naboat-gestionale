-- AlterTable
ALTER TABLE "Posto" ADD COLUMN     "rimossoAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Addebito" ADD COLUMN     "revisione" INTEGER NOT NULL DEFAULT 1;

CREATE TRIGGER revisione_condivisa BEFORE UPDATE ON "Addebito" FOR EACH ROW EXECUTE FUNCTION naboat_revisione();
ALTER TABLE "IndisponibilitaPosto" ADD CONSTRAINT indisponibilita_tenant_fkey FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE;
ALTER TABLE "IndisponibilitaPosto" ADD CONSTRAINT indisponibilita_posto_fkey FOREIGN KEY ("postoId") REFERENCES "Posto" ("id") ON DELETE CASCADE;
ALTER TABLE "OperazioneCondivisa" ADD CONSTRAINT operazione_tenant_fkey FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX indisponibilita_aperta ON "IndisponibilitaPosto" ("tenantId", "postoId", "motivo") WHERE "al" IS NULL;
ALTER TABLE "IndisponibilitaPosto" ADD CONSTRAINT indisponibilita_intervallo CHECK ("al" IS NULL OR "al" > "dal");

INSERT INTO "IndisponibilitaPosto" (id, "tenantId", "postoId", dal, motivo)
SELECT gen_random_uuid()::text, p."tenantId", p.id, CURRENT_TIMESTAMP, 'quadro' FROM "Posto" p JOIN "Area" a ON a.id = p."areaId" WHERE a.archiviata OR p.riga > a.righe OR p.colonna > a.colonne;
INSERT INTO "AuditLog" (id, "tenantId", azione, entita, "createdAt") SELECT gen_random_uuid()::text, id, 'ormeggio.capacita.storico_avviato', 'Tenant', CURRENT_TIMESTAMP FROM "Tenant";

CREATE FUNCTION naboat_capacita_quadro() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "IndisponibilitaPosto" (id, "tenantId", "postoId", dal, motivo)
  SELECT gen_random_uuid()::text, p."tenantId", p.id, CURRENT_TIMESTAMP, 'quadro' FROM "Posto" p
  WHERE p."areaId" = NEW.id AND (NEW.archiviata OR p.riga > NEW.righe OR p.colonna > NEW.colonne)
  AND NOT EXISTS (SELECT 1 FROM "IndisponibilitaPosto" b WHERE b."postoId" = p.id AND b.motivo = 'quadro' AND b.al IS NULL);
  UPDATE "IndisponibilitaPosto" b SET al = greatest(CURRENT_TIMESTAMP, b.dal + interval '1 millisecond') FROM "Posto" p
  WHERE p."areaId" = NEW.id AND NOT NEW.archiviata AND p.riga <= NEW.righe AND p.colonna <= NEW.colonne AND b."postoId" = p.id AND b.motivo = 'quadro' AND b.al IS NULL;
  RETURN NEW;
END $$;
CREATE TRIGGER area_capacita_quadro AFTER UPDATE ON "Area" FOR EACH ROW EXECUTE FUNCTION naboat_capacita_quadro();

CREATE FUNCTION naboat_posto_rimosso() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."rimossoAt" IS NOT NULL AND OLD."rimossoAt" IS NULL THEN
    INSERT INTO "IndisponibilitaPosto" (id, "tenantId", "postoId", dal, motivo) VALUES (gen_random_uuid()::text, NEW."tenantId", NEW.id, NEW."rimossoAt", 'rimozione');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER posto_capacita_rimossa AFTER UPDATE ON "Posto" FOR EACH ROW EXECUTE FUNCTION naboat_posto_rimosso();
