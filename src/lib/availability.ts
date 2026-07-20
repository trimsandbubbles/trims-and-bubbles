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

/** One open window of wall-clock times ("09:00"/"17:00"). Also used to
 * describe a single fixed slot (its start/end). */
export type DayWindow = { startTime: string; endTime: string };

/** A day's open windows. A day may have SEVERAL windows (e.g. 09:00-12:00 and
 * 15:00-20:00 with a mid-day break). Empty array or null = closed. */
export type DayHours = DayWindow[] | null;

/**
 * How a weekday's bookable times are decided.
 * - OPEN_HOURS: open windows; start times are auto-offered on a grid across
 *   each window, sized to the booking's duration (the original behaviour).
 * - FIXED_SLOTS: the owner hand-defines exact openings; each offers exactly one
 *   start time (its own start), and a booking is offered only if its whole
 *   duration finishes by that slot's end. One booking per slot.
 */
export type AvailabilityMode = "OPEN_HOURS" | "FIXED_SLOTS";

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
  /** Per-weekday scheduling mode, keyed by day of week. A missing entry means
   * OPEN_HOURS, so callers that don't set this get the original behaviour. */
  modes?: Record<number, AvailabilityMode>;
  /** Hand-defined fixed slots per weekday (only consulted when that weekday's
   * mode is FIXED_SLOTS), keyed by day of week. */
  fixedSlots?: Record<number, DayWindow[]>;
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

/**
 * Resolves what a date's bookable ranges are AND how to interpret them.
 *
 * A one-off exception always wins and is expressed as OPEN_HOURS (a closed day
 * has no ranges; a custom-hours day is one window) — so an exception behaves
 * identically regardless of the weekday's usual mode.
 *
 * `ranges` means open windows in OPEN_HOURS mode, or the fixed slots in
 * FIXED_SLOTS mode. Empty ranges = closed.
 */
export type ResolvedDaySchedule = { mode: AvailabilityMode; ranges: DayWindow[] };

function resolveDaySchedule(
  inputs: Pick<AvailabilityInputs, "dateStr" | "weeklyHours" | "modes" | "fixedSlots" | "exception">,
): ResolvedDaySchedule {
  if (inputs.exception) {
    if (inputs.exception.type === "CLOSED") return { mode: "OPEN_HOURS", ranges: [] };
    if (inputs.exception.customStartTime && inputs.exception.customEndTime) {
      return {
        mode: "OPEN_HOURS",
        ranges: [{ startTime: inputs.exception.customStartTime, endTime: inputs.exception.customEndTime }],
      };
    }
  }
  const dow = dayOfWeekFor(inputs.dateStr);
  const mode = inputs.modes?.[dow] ?? "OPEN_HOURS";
  if (mode === "FIXED_SLOTS") {
    return { mode, ranges: inputs.fixedSlots?.[dow] ?? [] };
  }
  return { mode: "OPEN_HOURS", ranges: inputs.weeklyHours[dow] ?? [] };
}

/** The bookable ranges for a date, ignoring the OPEN_HOURS/FIXED_SLOTS
 * distinction — used by display helpers that just need "when is this day open".
 * In FIXED_SLOTS mode these are the individual slots. */
export function resolveDayRanges(
  inputs: Pick<AvailabilityInputs, "dateStr" | "weeklyHours" | "modes" | "fixedSlots" | "exception">,
): DayWindow[] {
  return resolveDaySchedule(inputs).ranges;
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
  return getDaySlotsWithStatus(inputs).open;
}

/**
 * Like getOpenSlotsForDate, but also reports which grid positions were lost to
 * an existing booking/block — so the picker can show clients WHY a time isn't
 * offered ("Booked") instead of silently omitting it. `booked` contains only
 * slots that would otherwise have been offered (inside an open window, past
 * the lead time); times outside opening hours are simply absent.
 */
export function getDaySlotsWithStatus(inputs: AvailabilityInputs): { open: OpenSlot[]; booked: OpenSlot[] } {
  const bufferMinutes = inputs.bufferMinutes ?? 15;
  const slotIntervalMinutes = inputs.slotIntervalMinutes ?? 30;
  const minLeadMinutes = inputs.minLeadMinutes ?? 60;
  const now = inputs.now ?? new Date();

  const { mode, ranges } = resolveDaySchedule(inputs);
  if (ranges.length === 0) return { open: [], booked: [] };

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

  const open: OpenSlot[] = [];
  const booked: OpenSlot[] = [];

  // Considers a single candidate [slotStart, slotStart+duration): drops it if
  // it's before the lead time, otherwise files it under open or booked. Shared
  // by both modes so the buffer/lead/clash rules stay identical.
  const consider = (slotStartMs: number) => {
    const slotStart = new Date(slotStartMs);
    if (slotStart < earliestStart) return;
    const slotEnd = new Date(slotStartMs + durationMs);
    const clashes = bufferedBusy.some((b) => intervalsOverlap(slotStart, slotEnd, b.startAt, b.endAt));
    (clashes ? booked : open).push({ startAt: slotStart, endAt: slotEnd });
  };

  for (const r of ranges) {
    const rangeStart = zonedWallClockToInstant(inputs.dateStr, r.startTime);
    const rangeEnd = zonedWallClockToInstant(inputs.dateStr, r.endTime);
    if (rangeEnd <= rangeStart) continue;

    if (mode === "FIXED_SLOTS") {
      // A fixed slot offers exactly ONE start (its own start), and only if the
      // whole booking finishes by the slot's end. That yields "one booking per
      // slot": once its start is taken, the clash check hides the slot.
      if (rangeStart.getTime() + durationMs <= rangeEnd.getTime()) {
        consider(rangeStart.getTime());
      }
    } else {
      // OPEN_HOURS: each window is its own slot grid — a booking must START and
      // FINISH within one window, so a mid-day break is never overlapped.
      for (let start = rangeStart.getTime(); start + durationMs <= rangeEnd.getTime(); start += stepMs) {
        consider(start);
      }
    }
  }

  const byStart = (a: OpenSlot, b: OpenSlot) => a.startAt.getTime() - b.startAt.getTime();
  open.sort(byStart);
  booked.sort(byStart);
  return { open, booked };
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
