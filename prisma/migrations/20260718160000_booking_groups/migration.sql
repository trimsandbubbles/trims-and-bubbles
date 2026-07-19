-- AlterTable
ALTER TABLE "appointment" ADD COLUMN     "bookingGroupId" TEXT;

-- CreateIndex
CREATE INDEX "appointment_bookingGroupId_idx" ON "appointment"("bookingGroupId");
