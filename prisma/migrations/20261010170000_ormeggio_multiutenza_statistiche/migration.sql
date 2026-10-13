-- CreateEnum
CREATE TYPE "RuoloOrmeggio" AS ENUM ('responsabile', 'addetto', 'visualizzazione');

-- CreateEnum
CREATE TYPE "StatoAppartenenza" AS ENUM ('attiva', 'sospesa', 'rimossa');

-- AlterTable
ALTER TABLE "Boat" ADD COLUMN     "revisione" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Proprietario" ADD COLUMN     "revisione" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Area" ADD COLUMN     "revisione" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Posto" ADD COLUMN     "revisione" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Permanenza" ADD COLUMN     "revisione" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Attivita" ADD COLUMN     "revisione" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ServizioCatalogo" ADD COLUMN     "revisione" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ContrattoOrmeggio" ADD COLUMN     "revisione" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "Appartenenza" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'operatore',
    "ruoloOrmeggio" "RuoloOrmeggio" NOT NULL DEFAULT 'responsabile',
    "vedeImporti" BOOLEAN NOT NULL DEFAULT false,
    "accessoNoleggio" BOOLEAN NOT NULL DEFAULT false,
    "accessoOrmeggio" BOOLEAN NOT NULL DEFAULT true,
    "stato" "StatoAppartenenza" NOT NULL DEFAULT 'attiva',
    "revisione" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appartenenza_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollaboratoreInvito" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ruoloOrmeggio" "RuoloOrmeggio" NOT NULL,
    "vedeImporti" BOOLEAN NOT NULL DEFAULT false,
    "tokenHash" TEXT NOT NULL,
    "scadeAt" TIMESTAMP(3) NOT NULL,
    "accettatoAt" TIMESTAMP(3),
    "revocatoAt" TIMESTAMP(3),
    "creatoDa" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollaboratoreInvito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndisponibilitaPosto" (
    "motivo" TEXT NOT NULL DEFAULT 'blocco',
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "postoId" TEXT NOT NULL,
    "dal" TIMESTAMP(3) NOT NULL,
    "al" TIMESTAMP(3),

    CONSTRAINT "IndisponibilitaPosto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Appartenenza_userId_stato_idx" ON "Appartenenza"("userId", "stato");

-- CreateIndex
CREATE UNIQUE INDEX "Appartenenza_tenantId_userId_key" ON "Appartenenza"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CollaboratoreInvito_tokenHash_key" ON "CollaboratoreInvito"("tokenHash");

-- CreateIndex
CREATE INDEX "CollaboratoreInvito_tenantId_email_idx" ON "CollaboratoreInvito"("tenantId", "email");

-- CreateIndex
CREATE INDEX "IndisponibilitaPosto_tenantId_postoId_dal_idx" ON "IndisponibilitaPosto"("tenantId", "postoId", "dal");

-- AddForeignKey
ALTER TABLE "Appartenenza" ADD CONSTRAINT "Appartenenza_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appartenenza" ADD CONSTRAINT "Appartenenza_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollaboratoreInvito" ADD CONSTRAINT "CollaboratoreInvito_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;


INSERT INTO "Appartenenza" ("id", "tenantId", "userId", "role", "vedeImporti", "accessoNoleggio", "accessoOrmeggio", "updatedAt")
SELECT gen_random_uuid()::text, u."tenantId", u."id", u."role", u."vedeImporti", NOT t."moduloOrmeggio" OR t."tipoModulo" = 'entrambi', t."moduloOrmeggio" AND u."role" <> 'skipper', CURRENT_TIMESTAMP
FROM "User" u JOIN "Tenant" t ON t."id" = u."tenantId" WHERE u."role" <> 'superadmin';

CREATE FUNCTION naboat_appartenenza_legacy() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."tenantId" IS NOT NULL AND NEW."role" <> 'superadmin' THEN
    IF TG_OP = 'INSERT' OR OLD."tenantId" IS DISTINCT FROM NEW."tenantId" THEN
      INSERT INTO "Appartenenza" ("id", "tenantId", "userId", "role", "vedeImporti", "accessoNoleggio", "accessoOrmeggio", "updatedAt")
      SELECT gen_random_uuid()::text, t."id", NEW."id", NEW."role", NEW."vedeImporti", NOT t."moduloOrmeggio" OR t."tipoModulo" = 'entrambi', t."moduloOrmeggio" AND NEW."role" <> 'skipper', CURRENT_TIMESTAMP FROM "Tenant" t WHERE t."id" = NEW."tenantId"
      ON CONFLICT ("tenantId", "userId") DO NOTHING;
    ELSIF OLD."role" IS DISTINCT FROM NEW."role" OR OLD."vedeImporti" IS DISTINCT FROM NEW."vedeImporti" THEN
      UPDATE "Appartenenza" SET "role" = NEW."role", "vedeImporti" = NEW."vedeImporti", "revisione" = "revisione" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "tenantId" = NEW."tenantId" AND "userId" = NEW."id";
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER user_appartenenza_legacy AFTER INSERT OR UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION naboat_appartenenza_legacy();

CREATE FUNCTION naboat_ultimo_titolare() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."role" = 'owner' AND OLD."stato" = 'attiva' AND (TG_OP = 'DELETE' OR NEW."role" <> 'owner' OR NEW."stato" <> 'attiva') THEN
    PERFORM 1 FROM "Tenant" WHERE "id" = OLD."tenantId" FOR UPDATE;
    IF FOUND AND NOT EXISTS (SELECT 1 FROM "Appartenenza" WHERE "tenantId" = OLD."tenantId" AND "id" <> OLD."id" AND "role" = 'owner' AND "stato" = 'attiva') THEN
      RAISE EXCEPTION 'ultimo_titolare_attivo' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER appartenenza_ultimo_titolare BEFORE UPDATE OR DELETE ON "Appartenenza" FOR EACH ROW EXECUTE FUNCTION naboat_ultimo_titolare();

CREATE UNIQUE INDEX invito_attivo_email_tenant ON "CollaboratoreInvito" ("tenantId", "email") WHERE "accettatoAt" IS NULL AND "revocatoAt" IS NULL;
ALTER TABLE "CollaboratoreInvito" ADD CONSTRAINT invito_email_normalizzata CHECK ("email" = lower(trim("email")));
ALTER TABLE "Appartenenza" ADD CONSTRAINT importi_ruolo CHECK ("role" = 'owner' OR "ruoloOrmeggio" = 'responsabile' OR NOT "vedeImporti");

CREATE FUNCTION naboat_revisione() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW."revisione" = OLD."revisione" + 1; RETURN NEW; END $$;
CREATE TRIGGER revisione_condivisa BEFORE UPDATE ON "Boat" FOR EACH ROW EXECUTE FUNCTION naboat_revisione();
CREATE TRIGGER revisione_condivisa BEFORE UPDATE ON "Proprietario" FOR EACH ROW EXECUTE FUNCTION naboat_revisione();
CREATE TRIGGER revisione_condivisa BEFORE UPDATE ON "Area" FOR EACH ROW EXECUTE FUNCTION naboat_revisione();
CREATE TRIGGER revisione_condivisa BEFORE UPDATE ON "Posto" FOR EACH ROW EXECUTE FUNCTION naboat_revisione();
CREATE TRIGGER revisione_condivisa BEFORE UPDATE ON "Permanenza" FOR EACH ROW EXECUTE FUNCTION naboat_revisione();
CREATE TRIGGER revisione_condivisa BEFORE UPDATE ON "Attivita" FOR EACH ROW EXECUTE FUNCTION naboat_revisione();
CREATE TRIGGER revisione_condivisa BEFORE UPDATE ON "ServizioCatalogo" FOR EACH ROW EXECUTE FUNCTION naboat_revisione();
CREATE TRIGGER revisione_condivisa BEFORE UPDATE ON "ContrattoOrmeggio" FOR EACH ROW EXECUTE FUNCTION naboat_revisione();

INSERT INTO "IndisponibilitaPosto" ("id", "tenantId", "postoId", "dal") SELECT gen_random_uuid()::text, "tenantId", "id", CURRENT_TIMESTAMP FROM "Posto" WHERE "bloccato";
CREATE FUNCTION naboat_indisponibilita() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."bloccato" AND (TG_OP = 'INSERT' OR NOT OLD."bloccato") THEN
    INSERT INTO "IndisponibilitaPosto" ("id", "tenantId", "postoId", "dal") VALUES (gen_random_uuid()::text, NEW."tenantId", NEW."id", CURRENT_TIMESTAMP);
  ELSIF NOT NEW."bloccato" AND OLD."bloccato" THEN
    UPDATE "IndisponibilitaPosto" SET "al" = CURRENT_TIMESTAMP WHERE "tenantId" = NEW."tenantId" AND "postoId" = NEW."id" AND "al" IS NULL AND "motivo" = 'blocco';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER posto_disponibilita AFTER INSERT OR UPDATE ON "Posto" FOR EACH ROW EXECUTE FUNCTION naboat_indisponibilita();
