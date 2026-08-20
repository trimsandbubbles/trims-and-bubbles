-- Tracks when the 2-day reminder email was sent, so the daily cron is idempotent.
ALTER TABLE "appointment" ADD COLUMN "reminderSentAt" TIMESTAMPTZ(3);
