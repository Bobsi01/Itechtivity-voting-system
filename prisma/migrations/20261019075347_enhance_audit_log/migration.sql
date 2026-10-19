-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "actorEmail" TEXT,
ADD COLUMN     "actorName" TEXT,
ADD COLUMN     "actorRole" TEXT,
ADD COLUMN     "summary" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_resource_createdAt_idx" ON "AuditLog"("resource", "createdAt");
