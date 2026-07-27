-- A customer-facing, owner-editable "about how long this takes" label,
-- separate from durationMinutes (the booking slot length).
ALTER TABLE "service" ADD COLUMN "timeEstimate" TEXT;
