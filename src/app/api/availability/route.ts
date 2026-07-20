import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getSlotsWithStatusForDate,
  totalDurationMinutes,
  getWeeklyHoursMap,
  getExceptionForDate,
} from "@/lib/availability-data";
import type { DayWindow } from "@/lib/availability";

/** A day is at most ~15h open; 24h is a safe hard cap on a requested block. */
const MAX_DURATION_MINUTES = 24 * 60;

function minutesSinceMidnight(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function windowMinutes(w: DayWindow): number {
  return Math.max(0, minutesSinceMidnight(w.endTime) - minutesSinceMidnight(w.startTime));
}

/** Same weekday-of-a-calendar-date logic as availability.ts's (private)
 * dayOfWeekFor — timezone-agnostic by design, since a calendar date's weekday
 * doesn't depend on where you're standing. Duplicated here only because that
 * helper isn't exported; kept in lockstep with the one in availability.ts. */
function dayOfWeekFor(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Which windows are open on `dateStr`, for DISPLAY purposes only (explaining
 * the day to the client) — mirrors availability.ts's (private) resolveDayHours
 * precedence (a one-off exception overrides the recurring weekly hours), using
 * the same exported data helpers the actual slot engine uses. This does not
 * decide what's bookable; getSlotsWithStatusForDate/getDaySlotsWithStatus
 * remains the sole source of truth for that.
 */
function resolveDisplayWindows(
  dateStr: string,
  weeklyHours: Record<number, DayWindow[] | null>,
  exception: { type: "CLOSED" | "CUSTOM_HOURS"; customStartTime?: string | null; customEndTime?: string | null } | null,
): DayWindow[] {
  if (exception) {
    if (exception.type === "CLOSED") return [];
    if (exception.customStartTime && exception.customEndTime) {
      return [{ startTime: exception.customStartTime, endTime: exception.customEndTime }];
    }
  }
  return weeklyHours[dayOfWeekFor(dateStr)] ?? [];
}

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
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

  const [{ open, booked }, weeklyHours, exception] = await Promise.all([
    getSlotsWithStatusForDate(date, duration),
    getWeeklyHoursMap(),
    getExceptionForDate(date),
  ]);

  const toDTO = (s: { startAt: Date; endAt: Date }) => ({
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
  });

  // Display-only info about the day, so the client can explain WHY a search
  // came up empty (closed / too short a day / genuinely fully booked) rather
  // than reporting exhaustion with no reason.
  const windows = resolveDisplayWindows(date, weeklyHours, exception);
  const totalBookableMinutes = windows.reduce((sum, w) => sum + windowMinutes(w), 0);
  const longestWindowMinutes = windows.reduce((max, w) => Math.max(max, windowMinutes(w)), 0);
  // Other weekdays whose usual (non-exception) hours have a single window long
  // enough for this request — lets the client suggest a concrete day instead
  // of just "try again", without hard-coding any business-hours values.
  const betterWeekdays = Object.entries(weeklyHours)
    .filter(([, dayWindows]) => (dayWindows ?? []).some((w) => windowMinutes(w) >= duration))
    .map(([dow]) => Number(dow))
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
