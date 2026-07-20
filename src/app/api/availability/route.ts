import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getSlotsWithStatusForDate,
  totalDurationMinutes,
  getWeeklyHoursMap,
  getDayModesMap,
  getFixedSlotsMap,
  getExceptionForDate,
} from "@/lib/availability-data";
import { resolveDayRanges, type AvailabilityMode, type DayWindow } from "@/lib/availability";

/** A day is at most ~15h open; 24h is a safe hard cap on a requested block. */
const MAX_DURATION_MINUTES = 24 * 60;

function minutesSinceMidnight(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function windowMinutes(w: DayWindow): number {
  return Math.max(0, minutesSinceMidnight(w.endTime) - minutesSinceMidnight(w.startTime));
}

/** The recurring bookable ranges for a weekday, mode-aware and ignoring one-off
 * exceptions — used only to suggest "better weekdays". In FIXED_SLOTS mode
 * these are the individual slots; in OPEN_HOURS mode, the open windows. */
function weekdayRanges(
  dow: number,
  weeklyHours: Record<number, DayWindow[] | null>,
  modes: Record<number, AvailabilityMode>,
  fixedSlots: Record<number, DayWindow[]>,
): DayWindow[] {
  if ((modes[dow] ?? "OPEN_HOURS") === "FIXED_SLOTS") return fixedSlots[dow] ?? [];
  return weeklyHours[dow] ?? [];
}

/** The regex only checks shape (YYYY-MM-DD); it happily accepts calendar
 * nonsense like "2026-02-30" or "2026-13-01". Those then reach `new
 * Date(...)`/Date.UTC calls downstream (getExceptionForDate, dayOfWeekFor)
 * as an Invalid Date, which Prisma/pg can't serialize — that surfaced as an
 * unhandled 500 with an empty body instead of a clean 400. Round-tripping
 * through Date.UTC and comparing the components back out catches any date
 * that doesn't actually exist on the calendar (including Feb 29 on a
 * non-leap year) before it reaches any downstream date math. */
function isRealCalendarDate(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const querySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .refine(isRealCalendarDate, "date must be a real calendar date"),
  // Preferred: the TOTAL duration to reserve (sum of every dog's service +
  // add-ons in a multi-dog booking). When present it's used directly.
  durationMinutes: z.coerce.number().int().positive().max(MAX_DURATION_MINUTES).optional(),
  // Fallback: a single service (+ add-ons) whose duration we look up.
  serviceId: z.string().optional(),
  addOnIds: z.string().optional(),
});

/**
 * Read-only slot lookup — deliberately a Route Handler rather than a Server
 * Action, since the booking wizard calls this repeatedly as the client clicks
 * around dates (Server Actions are dispatched sequentially per client and are
 * meant for mutations, not this kind of repeated read).
 *
 * Accepts either `durationMinutes` (the total block for a multi-dog booking)
 * or `serviceId`(+`addOnIds`) whose duration is looked up server-side.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    date: searchParams.get("date") ?? undefined,
    durationMinutes: searchParams.get("durationMinutes") ?? undefined,
    serviceId: searchParams.get("serviceId") ?? undefined,
    addOnIds: searchParams.get("addOnIds") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { date, durationMinutes, serviceId, addOnIds } = parsed.data;

  let duration: number;
  if (durationMinutes) {
    duration = durationMinutes;
  } else if (serviceId) {
    const addOnIdList = addOnIds ? addOnIds.split(",").filter(Boolean) : [];
    const [service, addOns] = await Promise.all([
      prisma.service.findUnique({ where: { id: serviceId } }),
      addOnIdList.length
        ? prisma.service.findMany({ where: { id: { in: addOnIdList }, active: true } })
        : Promise.resolve([]),
    ]);
    if (!service || !service.active) {
      return NextResponse.json({ error: "Unknown service" }, { status: 404 });
    }
    duration = totalDurationMinutes(
      service.durationMinutes,
      addOns.map((a) => a.durationMinutes),
    );
  } else {
    return NextResponse.json({ error: "Provide durationMinutes or serviceId" }, { status: 400 });
  }

  const [{ open, booked }, weeklyHours, modes, fixedSlots, exception] = await Promise.all([
    getSlotsWithStatusForDate(date, duration),
    getWeeklyHoursMap(),
    getDayModesMap(),
    getFixedSlotsMap(),
    getExceptionForDate(date),
  ]);

  const toDTO = (s: { startAt: Date; endAt: Date }) => ({
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
  });

  // Display-only info about the day, so the client can explain WHY a search
  // came up empty (closed / too short a day / genuinely fully booked) rather
  // than reporting exhaustion with no reason. Mode-aware: in FIXED_SLOTS mode
  // these ranges are the individual slots. Uses the SAME resolver the slot
  // engine uses, so display and bookability can't drift apart.
  const windows = resolveDayRanges({ dateStr: date, weeklyHours, modes, fixedSlots, exception });
  const totalBookableMinutes = windows.reduce((sum, w) => sum + windowMinutes(w), 0);
  const longestWindowMinutes = windows.reduce((max, w) => Math.max(max, windowMinutes(w)), 0);
  // Other weekdays whose usual (non-exception) hours have a single range long
  // enough for this request — lets the client suggest a concrete day instead
  // of just "try again", without hard-coding any business-hours values.
  const betterWeekdays = [0, 1, 2, 3, 4, 5, 6]
    .filter((dow) => weekdayRanges(dow, weeklyHours, modes, fixedSlots).some((w) => windowMinutes(w) >= duration))
    .sort((a, b) => a - b);

  return NextResponse.json({
    slots: open.map(toDTO),
    // Times lost to an existing booking/block — shown greyed-out ("Booked") so
    // clients can see why a time isn't offered. Bare start/end times only; no
    // client or pet details are ever exposed here.
    booked: booked.map(toDTO),
    // The duration this response was computed for, echoed back so the client
    // never has to trust it already has the right value in state.
    durationMinutes: duration,
    hours: {
      closed: windows.length === 0,
      // Wall-clock open windows for this exact date, e.g. [{ start: "16:00", end: "20:00" }].
      windows: windows.map((w) => ({ start: w.startTime, end: w.endTime })),
      totalBookableMinutes,
      longestWindowMinutes,
      betterWeekdays,
    },
  });
}
