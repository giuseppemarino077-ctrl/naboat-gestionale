-- DropForeignKey
ALTER TABLE "IndisponibilitaPosto" DROP CONSTRAINT "indisponibilita_posto_fkey";

-- DropForeignKey
ALTER TABLE "IndisponibilitaPosto" DROP CONSTRAINT "indisponibilita_tenant_fkey";

-- DropForeignKey
ALTER TABLE "OperazioneCondivisa" DROP CONSTRAINT "operazione_tenant_fkey";

-- AddForeignKey
ALTER TABLE "IndisponibilitaPosto" ADD CONSTRAINT "IndisponibilitaPosto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndisponibilitaPosto" ADD CONSTRAINT "IndisponibilitaPosto_postoId_fkey" FOREIGN KEY ("postoId") REFERENCES "Posto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperazioneCondivisa" ADD CONSTRAINT "OperazioneCondivisa_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
