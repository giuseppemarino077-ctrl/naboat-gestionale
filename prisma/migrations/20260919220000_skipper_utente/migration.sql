-- AlterTable
ALTER TABLE "Skipper" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Skipper_userId_key" ON "Skipper"("userId");

-- AddForeignKey
ALTER TABLE "Skipper" ADD CONSTRAINT "Skipper_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

