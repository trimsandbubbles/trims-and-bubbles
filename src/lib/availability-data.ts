import "server-only";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { getBusinessSettings } from "@/lib/services-data";
import {
  BUSINESS_TIMEZONE,
  getDaySlotsWithStatus,
  getOpenSlotsForDate,
  isSlotStillOpen,
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
