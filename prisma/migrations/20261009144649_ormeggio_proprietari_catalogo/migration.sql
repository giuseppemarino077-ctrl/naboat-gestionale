-- AlterTable
ALTER TABLE "Proprietario" ADD COLUMN     "archiviato" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "catalogoOrmeggioInizializzato" BOOLEAN NOT NULL DEFAULT false;
