-- Growth features: Google review link + configurable rebooking nudge, and a
-- per-appointment flag so the rebooking cron never nudges the same visit twice.
ALTER TABLE "business_settings" ADD COLUMN "googleReviewUrl" TEXT;
ALTER TABLE "business_settings" ADD COLUMN "rebookWeeks" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "appointment" ADD COLUMN "rebookNudgeSentAt" TIMESTAMPTZ(3);
