import { fromZonedTime } from "date-fns-tz";

/**
 * Pure, framework-free slot-generation logic — the highest-risk business logic
 * in the app, so it's kept free of Prisma/Next imports and fully unit-tested
 * (see availability.test.ts). Data-fetching glue lives in availability-data.ts.
 */

export const BUSINESS_TIMEZONE = "Australia/Sydney";

export type BusyInterval = {
  startAt: Date;
  endAt: Date;
};

/** Open/close wall-clock times ("09:00"/"17:00") for a single day, or null if closed. */
export type DayHours = { startTime: string; endTime: string } | null;

export type DateException = {
  type: "CLOSED" | "CUSTOM_HOURS";
  customStartTime?: string | null;
  customEndTime?: string | null;
};

export type AvailabilityInputs = {
  /** Calendar date to compute slots for, as "YYYY-MM-DD" (a Sydney business-calendar date). */
  dateStr: string;
  /** Total duration to reserve: primary service + add-ons, in minutes. */
  durationMinutes: number;
  /** Recurring weekly hours, keyed by day of week (0 = Sunday .. 6 = Saturday). */
  weeklyHours: Record<number, DayHours>;
  /** One-off override for this exact date, if any. Takes precedence over weeklyHours. */
  exception?: DateException | null;
  /** Existing appointments (non-cancelled) and ad hoc blocks that already occupy time. */
  busy: BusyInterval[];
  /** Minimum gap required after a booking before the next one can start. Default 15. */
  bufferMinutes?: number;
  /** Granularity of offered start times, in minutes. Default 30. */
  slotIntervalMinutes?: number;
  /** Don't offer slots starting sooner than this many minutes from `now`. Default 60. */
  minLeadMinutes?: number;
  /** Injectable "current time" for deterministic testing. Defaults to `new Date()`. */
  now?: Date;
};

export type OpenSlot = { startAt: Date; endAt: Date };

function dayOfWeekFor(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  // Computed via Date.UTC purely to ask "what weekday is this calendar date" —
  // deliberately timezone-agnostic (a calendar date's weekday doesn't depend
  // on where you're standing).
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Converts a "HH:mm" wall-clock time on `dateStr`, interpreted in the
 * business's timezone, into the real UTC instant it refers to. */
function zonedWallClockToInstant(dateStr: string, hhmm: string): Date {
  return fromZonedTime(`${dateStr}T${hhmm}:00`, BUSINESS_TIMEZONE);
}

function resolveDayHours(inputs: Pick<AvailabilityInputs, "dateStr" | "weeklyHours" | "exception">): DayHours {
  if (inputs.exception) {
    if (inputs.exception.type === "CLOSED") return null;
    if (inputs.exception.customStartTime && inputs.exception.customEndTime) {
      return { startTime: inputs.exception.customStartTime, endTime: inputs.exception.customEndTime };
    }
  }
  const dow = dayOfWeekFor(inputs.dateStr);
  return inputs.weeklyHours[dow] ?? null;
}

function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Returns the list of bookable [startAt, endAt) slots for one calendar date,
 * given business hours, existing bookings, and a required service duration.
 *
 * This is UX-facing: it decides what to *offer*. The database's exclusion
 * constraint (see prisma/migrations) is the hard safety net that makes a true
 * double-booking structurally impossible even if this function, a race
 * condition, or a future bug lets one through here.
 */
export function getOpenSlotsForDate(inputs: AvailabilityInputs): OpenSlot[] {
  const bufferMinutes = inputs.bufferMinutes ?? 15;
  const slotIntervalMinutes = inputs.slotIntervalMinutes ?? 30;
  const minLeadMinutes = inputs.minLeadMinutes ?? 60;
  const now = inputs.now ?? new Date();

  const hours = resolveDayHours(inputs);
  if (!hours) return [];

  const dayStart = zonedWallClockToInstant(inputs.dateStr, hours.startTime);
  const dayEnd = zonedWallClockToInstant(inputs.dateStr, hours.endTime);
  if (dayEnd <= dayStart) return [];

  // Busy ranges get a trailing buffer added so consecutive bookings keep a
  // gap — the DB constraint (no buffer) is the hard rule; this is the softer
  // scheduling preference that decides what we *offer*.
  const bufferedBusy = inputs.busy.map((b) => ({
    startAt: b.startAt,
    endAt: new Date(b.endAt.getTime() + bufferMinutes * 60_000),
  }));

  const earliestStart = new Date(now.getTime() + minLeadMinutes * 60_000);
  const durationMs = inputs.durationMinutes * 60_000;
  const stepMs = slotIntervalMinutes * 60_000;

  const slots: OpenSlot[] = [];
  for (let start = dayStart.getTime(); start + durationMs <= dayEnd.getTime(); start += stepMs) {
    const slotStart = new Date(start);
    const slotEnd = new Date(start + durationMs);

    if (slotStart < earliestStart) continue;

    const clashes = bufferedBusy.some((b) => intervalsOverlap(slotStart, slotEnd, b.startAt, b.endAt));
    if (clashes) continue;

    slots.push({ startAt: slotStart, endAt: slotEnd });
  }

  return slots;
}

/** True if a candidate [startAt, endAt) range is still free given the same
 * busy list — used as a final in-transaction re-check right before writing a
 * new appointment, to shrink (not eliminate — that's the DB constraint's job)
 * the race window between "slot shown" and "slot booked". */
export function isSlotStillOpen(
  candidate: { startAt: Date; endAt: Date },
  busy: BusyInterval[],
  bufferMinutes = 15,
): boolean {
  return !busy.some((b) => {
    const bufferedEnd = new Date(b.endAt.getTime() + bufferMinutes * 60_000);
    return intervalsOverlap(candidate.startAt, candidate.endAt, b.startAt, bufferedEnd);
  });
}
