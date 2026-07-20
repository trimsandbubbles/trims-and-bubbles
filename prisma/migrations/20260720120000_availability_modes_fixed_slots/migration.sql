-- CreateEnum
CREATE TYPE "AvailabilityMode" AS ENUM ('OPEN_HOURS', 'FIXED_SLOTS');

-- CreateTable
CREATE TABLE "day_schedule" (
    "dayOfWeek" INTEGER NOT NULL,
    "mode" "AvailabilityMode" NOT NULL DEFAULT 'OPEN_HOURS',

    CONSTRAINT "day_schedule_pkey" PRIMARY KEY ("dayOfWeek")
);

-- CreateTable
CREATE TABLE "availability_slot" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "availability_slot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "availability_slot_dayOfWeek_idx" ON "availability_slot"("dayOfWeek");
