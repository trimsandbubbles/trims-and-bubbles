-- The exact drop-off address shown to a customer only after they book (on the
-- confirmation screen + email). Kept separate from the public fullAddress.
ALTER TABLE "business_settings" ADD COLUMN "bookingAddress" TEXT;
