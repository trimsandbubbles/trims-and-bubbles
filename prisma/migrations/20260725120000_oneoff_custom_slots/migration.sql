-- One-off custom drop-off slots for a specific date.
-- A new exception type plus a JSON column holding that date's slots.
ALTER TYPE "ExceptionType" ADD VALUE IF NOT EXISTS 'CUSTOM_SLOTS';

ALTER TABLE "availability_exception" ADD COLUMN "customSlots" JSONB;
