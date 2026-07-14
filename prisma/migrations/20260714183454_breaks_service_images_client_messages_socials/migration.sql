-- DropIndex
DROP INDEX "availability_rule_dayOfWeek_key";

-- AlterTable
ALTER TABLE "business_settings" ADD COLUMN     "tiktokUrl" TEXT,
ADD COLUMN     "youtubeUrl" TEXT;

-- AlterTable
ALTER TABLE "service" ADD COLUMN     "imageUrl" TEXT;

-- CreateTable
CREATE TABLE "client_message" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "sentByUserId" TEXT,
    "readAt" TIMESTAMPTZ(3),
    "emailedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_message_clientId_createdAt_idx" ON "client_message"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "availability_rule_dayOfWeek_idx" ON "availability_rule"("dayOfWeek");

-- AddForeignKey
ALTER TABLE "client_message" ADD CONSTRAINT "client_message_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
