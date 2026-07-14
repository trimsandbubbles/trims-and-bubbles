-- Structural double-booking prevention: even if application-level checks have a
-- bug or a race condition, Postgres itself will refuse to insert/update an
-- Appointment whose [startAt, endAt) range overlaps another non-cancelled
-- appointment.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Postgres's built-in tstzrange() constructor is marked STABLE (not IMMUTABLE),
-- which Postgres refuses to allow in an index/exclusion-constraint expression.
-- The timestamptz values themselves are absolute UTC instants regardless of
-- session timezone, so wrapping it as IMMUTABLE here is safe and is the
-- standard, documented workaround for this specific Postgres limitation.
CREATE OR REPLACE FUNCTION immutable_tstzrange(timestamptz, timestamptz)
RETURNS tstzrange AS $$
  SELECT tstzrange($1, $2, '[)');
$$ LANGUAGE sql IMMUTABLE STRICT;

ALTER TABLE "appointment"
  ADD CONSTRAINT no_overlapping_appointments
  EXCLUDE USING gist (
    immutable_tstzrange("startAt", "endAt") WITH &&
  )
  WHERE (status NOT IN ('CANCELLED', 'NO_SHOW'));
