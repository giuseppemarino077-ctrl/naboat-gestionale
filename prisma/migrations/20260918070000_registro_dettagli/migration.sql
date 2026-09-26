-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "dettagli" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

