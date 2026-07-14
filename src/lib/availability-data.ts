import "server-only";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { getBusinessSettings } from "@/lib/services-data";
import {
  BUSINESS_TIMEZONE,
  getOpenSlotsForDate,
  isSlotStillOpen,
  type BusyInterval,
  type DateException,
  type DayHours,
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
  const rules = await prisma.availabilityRule.findMany();
  const map: Record<number, DayHours> = {};
  for (const rule of rules) {
    map[rule.dayOfWeek] = rule.isActive ? { startTime: rule.startTime, endTime: rule.endTime } : null;
  }
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
  const [weeklyHours, exception, settings, busy] = await Promise.all([
    getWeeklyHoursMap(),
    getExceptionForDate(dateStr),
    getBusinessSettings(),
    getBusyIntervalsForDate(dateStr, excludeAppointmentId),
  ]);

  return getOpenSlotsForDate({
    dateStr,
    durationMinutes,
    weeklyHours,
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
