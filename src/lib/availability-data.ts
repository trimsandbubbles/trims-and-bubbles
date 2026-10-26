import "server-only";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { getBusinessSettings } from "@/lib/services-data";
import {
  BUSINESS_TIMEZONE,
  getDaySlotsWithStatus,
  getOpenSlotsForDate,
  isSlotStillOpen,
  resolveDaySchedule,
  type AvailabilityMode,
  type BusyInterval,
  type DateException,
  type DayHours,
  type DayWindow,
  type OpenSlot,
} from "@/lib/availability";

/** The full Sydney calendar day for `dateStr`, expressed as UTC instant bounds. */
export function sydneyCalendarDayRange(dateStr: string): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = fromZonedTime(`${dateStr}T00:00:00`, BUSINESS_TIMEZONE);
  const nextDateStr = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const end = fromZonedTime(`${nextDateStr}T00:00:00`, BUSINESS_TIMEZONE);
  return { start, end };
}

export async function getWeeklyHoursMap(): Promise<Record<number, DayHours>> {
  // A day may have several rows — one per open window (e.g. a mid-day break).
  // Inactive rows are remembered times for a closed day and contribute nothing.
  const rules = await prisma.availabilityRule.findMany({
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  const map: Record<number, DayHours> = {};
  for (const rule of rules) {
    if (!rule.isActive) continue;
    (map[rule.dayOfWeek] ??= []).push({ startTime: rule.startTime, endTime: rule.endTime });
  }
  return map;
}

/** Per-weekday scheduling mode. A weekday with no row defaults to OPEN_HOURS,
 * so days that were never configured keep the original behaviour. */
export async function getDayModesMap(): Promise<Record<number, AvailabilityMode>> {
  const rows = await prisma.daySchedule.findMany();
  const map: Record<number, AvailabilityMode> = {};
  for (const row of rows) map[row.dayOfWeek] = row.mode;
  return map;
}

/** Hand-defined fixed slots per weekday (active rows only), sorted by start.
 * Only meaningful for weekdays whose mode is FIXED_SLOTS. */
export async function getFixedSlotsMap(): Promise<Record<number, DayWindow[]>> {
  const slots = await prisma.availabilitySlot.findMany({
    where: { isActive: true },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
  const map: Record<number, DayWindow[]> = {};
  for (const s of slots) (map[s.dayOfWeek] ??= []).push({ startTime: s.startTime, endTime: s.endTime });
  return map;
}

export async function getExceptionForDate(dateStr: string): Promise<DateException | null> {
  const exception = await prisma.availabilityException.findUnique({
    where: { date: new Date(`${dateStr}T00:00:00.000Z`) },
  });
  if (!exception) return null;
  return {
    type: exception.type,
    customStartTime: exception.customStartTime,
    customEndTime: exception.customEndTime,
    // customSlots is a JSON column; when present it's an array of {startTime,endTime}.
    customSlots: Array.isArray(exception.customSlots)
      ? (exception.customSlots as { startTime: string; endTime: string }[])
      : null,
  };
}

export async function getBusyIntervalsForDate(
  dateStr: string,
  excludeAppointmentId?: string,
): Promise<BusyInterval[]> {
  const { start, end } = sydneyCalendarDayRange(dateStr);
  const [appointments, blocks] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        startAt: { lt: end },
        endAt: { gt: start },
        // When rescheduling, an appointment must not collide with its OWN
        // current time — exclude it from its own busy check.
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      },
      select: { startAt: true, endAt: true },
    }),
    prisma.blockedTimeSlot.findMany({
      where: { startAt: { lt: end }, endAt: { gt: start } },
      select: { startAt: true, endAt: true },
    }),
  ]);
  return [...appointments, ...blocks];
}

/** Total minutes to reserve for a primary service + selected add-on services. */
export function totalDurationMinutes(primaryDurationMinutes: number, addOnDurationsMinutes: number[]): number {
  return primaryDurationMinutes + addOnDurationsMinutes.reduce((sum, m) => sum + m, 0);
}

export async function getAvailableSlotsForDate(
  dateStr: string,
  durationMinutes: number,
  excludeAppointmentId?: string,
): Promise<OpenSlot[]> {
  const [weeklyHours, modes, fixedSlots, exception, settings, busy] = await Promise.all([
    getWeeklyHoursMap(),
    getDayModesMap(),
    getFixedSlotsMap(),
    getExceptionForDate(dateStr),
    getBusinessSettings(),
    getBusyIntervalsForDate(dateStr, excludeAppointmentId),
  ]);

  return getOpenSlotsForDate({
    dateStr,
    durationMinutes,
    weeklyHours,
    modes,
    fixedSlots,
    exception,
    busy,
    bufferMinutes: settings.bufferMinutes,
  });
}

/** Open AND booked grid slots for a date — the picker shows booked ones
 * greyed-out so clients can see why a time is unavailable. */
export async function getSlotsWithStatusForDate(
  dateStr: string,
  durationMinutes: number,
): Promise<{ open: OpenSlot[]; booked: OpenSlot[] }> {
  const [weeklyHours, modes, fixedSlots, exception, settings, busy] = await Promise.all([
    getWeeklyHoursMap(),
    getDayModesMap(),
    getFixedSlotsMap(),
    getExceptionForDate(dateStr),
    getBusinessSettings(),
    getBusyIntervalsForDate(dateStr),
  ]);

  return getDaySlotsWithStatus({
    dateStr,
    durationMinutes,
    weeklyHours,
    modes,
    fixedSlots,
    exception,
    busy,
    bufferMinutes: settings.bufferMinutes,
  });
}

/** Final in-transaction-adjacent re-check right before writing a new appointment. */
export async function checkSlotStillOpen(dateStr: string, candidate: { startAt: Date; endAt: Date }): Promise<boolean> {
  const [settings, busy] = await Promise.all([getBusinessSettings(), getBusyIntervalsForDate(dateStr)]);
  return isSlotStillOpen(candidate, busy, settings.bufferMinutes);
}

/**
 * Authoritative server-side re-validation that a requested [startAt, endAt)
 * range is a genuinely bookable slot for `dateStr`, using the SAME slot
 * source of truth the wizard/api use (getAvailableSlotsForDate). This guards
 * the createBooking server action against crafted direct calls that bypass the
 * UI slot picker: booking outside opening hours, on a CLOSED exception day,
 * below the minimum lead time, off the slot grid, or with add-ons pushing the
 * end past closing time / into a subsequent busy interval. Because the offered
 * slots are generated for this exact `durationMinutes`, a startAt that matches
 * an offered slot start is only valid if the full duration fits — so endAt is
 * checked too, defensively. */
export async function isRequestedSlotBookable(
  dateStr: string,
  candidate: { startAt: Date; endAt: Date },
  durationMinutes: number,
  excludeAppointmentId?: string,
): Promise<boolean> {
  const slots = await getAvailableSlotsForDate(dateStr, durationMinutes, excludeAppointmentId);
  return slots.some(
    (s) => s.startAt.getTime() === candidate.startAt.getTime() && s.endAt.getTime() === candidate.endAt.getTime(),
  );
}

/** One toggleable cell in the owner's "block off times" grid. `open` = free and
 * blockable; `booked` = held by a real appointment (can't be blocked); `blocked`
 * = an owner block that can be lifted (its `blockId` is how). */
export type BlockGridSlot = {
  startAt: string; // ISO
  endAt: string; // ISO
  status: "open" | "booked" | "blocked";
  blockId: string | null;
};

export type BlockGridDay = { dateStr: string; slots: BlockGridSlot[] };

/**
 * Builds the owner's "block off times" grid for `days` calendar dates starting
 * at `startDateStr` (a Sydney business-calendar date). One cell per offered
 * opening: a fixed/custom slot is one cell; an open-hours window is split into
 * hourly cells. Each cell is classed open / booked / blocked so the owner can
 * toggle the open ones off (and lift their own blocks) without ever touching a
 * real booking. Config + busy data are fetched in bulk (not per-date) so the
 * whole two-month grid is a handful of queries. Purely additive — creating and
 * removing blocks reuses the existing BlockedTimeSlot model the booking engine
 * already subtracts. */
export async function getBlockGridForRange(startDateStr: string, days: number): Promise<BlockGridDay[]> {
  const [sy, sm, sd] = startDateStr.split("-").map(Number);
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    dates.push(new Date(Date.UTC(sy, sm - 1, sd + i)).toISOString().slice(0, 10));
  }
  const rangeStart = sydneyCalendarDayRange(dates[0]).start;
  const rangeEnd = sydneyCalendarDayRange(dates[dates.length - 1]).end;

  const [weeklyHours, modes, fixedSlots, exceptionRows, appointments, blocks] = await Promise.all([
    getWeeklyHoursMap(),
    getDayModesMap(),
    getFixedSlotsMap(),
    prisma.availabilityException.findMany({
      where: {
        date: {
          gte: new Date(`${dates[0]}T00:00:00.000Z`),
          lte: new Date(`${dates[dates.length - 1]}T00:00:00.000Z`),
        },
      },
    }),
    prisma.appointment.findMany({
      where: { status: { notIn: ["CANCELLED", "NO_SHOW"] }, startAt: { lt: rangeEnd }, endAt: { gt: rangeStart } },
      select: { startAt: true, endAt: true },
    }),
    prisma.blockedTimeSlot.findMany({
      where: { startAt: { lt: rangeEnd }, endAt: { gt: rangeStart } },
      select: { id: true, startAt: true, endAt: true },
    }),
  ]);

  const exceptionByDate = new Map<string, DateException>();
  for (const e of exceptionRows) {
    exceptionByDate.set(e.date.toISOString().slice(0, 10), {
      type: e.type,
      customStartTime: e.customStartTime,
      customEndTime: e.customEndTime,
      customSlots: Array.isArray(e.customSlots) ? (e.customSlots as DayWindow[]) : null,
    });
  }

  const overlaps = (aS: Date, aE: Date, bS: Date, bE: Date) => aS < bE && aE > bS;
  const now = new Date();
  const STEP_MS = 60 * 60_000; // hourly cells for open-hours windows

  return dates.map((ds): BlockGridDay => {
    const { mode, ranges } = resolveDaySchedule({
      dateStr: ds,
      weeklyHours,
      modes,
      fixedSlots,
      exception: exceptionByDate.get(ds) ?? null,
    });
    if (ranges.length === 0) return { dateStr: ds, slots: [] };

    const cells: { start: Date; end: Date }[] = [];
    for (const r of ranges) {
      const rs = fromZonedTime(`${ds}T${r.startTime}:00`, BUSINESS_TIMEZONE);
      const re = fromZonedTime(`${ds}T${r.endTime}:00`, BUSINESS_TIMEZONE);
      if (re.getTime() <= rs.getTime()) continue;
      if (mode === "FIXED_SLOTS") {
        cells.push({ start: rs, end: re }); // each fixed/custom slot is one cell
      } else {
        for (let t = rs.getTime(); t < re.getTime(); t += STEP_MS) {
          cells.push({ start: new Date(t), end: new Date(Math.min(t + STEP_MS, re.getTime())) });
        }
      }
    }

    const slots: BlockGridSlot[] = [];
    for (const c of cells) {
      if (c.end.getTime() <= now.getTime()) continue; // hide slots already past
      const block = blocks.find((b) => overlaps(c.start, c.end, b.startAt, b.endAt));
      if (block) {
        slots.push({ startAt: c.start.toISOString(), endAt: c.end.toISOString(), status: "blocked", blockId: block.id });
        continue;
      }
      const booked = appointments.some((a) => overlaps(c.start, c.end, a.startAt, a.endAt));
      slots.push({ startAt: c.start.toISOString(), endAt: c.end.toISOString(), status: booked ? "booked" : "open", blockId: null });
    }
    return { dateStr: ds, slots };
  });
}
