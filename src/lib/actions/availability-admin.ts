"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/session";

const windowSchema = z.object({
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
});

const dayScheduleSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  isActive: z.boolean(),
  // A day can have several open windows — e.g. 09:00-12:00 and 15:00-20:00
  // with a break in between. At least one window is kept even for a closed
  // day so the times are remembered when it's switched back on.
  windows: z.array(windowSchema).min(1, "Each day needs at least one time range").max(4),
});

export type ActionResult = { status: "success" } | { status: "error"; message: string };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function updateWeeklyHours(days: z.infer<typeof dayScheduleSchema>[]): Promise<ActionResult> {
  await requireOwner();
  const parsed = z.array(dayScheduleSchema).safeParse(days);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the hours entered." };
  }
  for (const d of parsed.data) {
    if (!d.isActive) continue;
    const sorted = [...d.windows].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (const w of sorted) {
      if (w.endTime <= w.startTime) {
        return { status: "error", message: `${DAY_NAMES[d.dayOfWeek]}: each finish time must be after its start time.` };
      }
    }
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startTime < sorted[i - 1].endTime) {
        return { status: "error", message: `${DAY_NAMES[d.dayOfWeek]}: the time ranges overlap — adjust them so they don't.` };
      }
    }
  }

  // Replace each day's rows wholesale — simplest correct behaviour now that a
  // day can hold any number of window rows.
  await prisma.$transaction([
    prisma.availabilityRule.deleteMany({}),
    prisma.availabilityRule.createMany({
      data: parsed.data.flatMap((d) =>
        d.windows.map((w) => ({
          dayOfWeek: d.dayOfWeek,
          isActive: d.isActive,
          startTime: w.startTime,
          endTime: w.endTime,
        })),
      ),
    }),
  ]);

  revalidatePath("/admin/availability");
  revalidatePath("/contact");
  revalidatePath("/book");
  return { status: "success" };
}

// ── Combined weekly availability (modes + open-hours windows + fixed slots) ──
//
// One "Save" persists the whole week. Every day carries BOTH its open-hours
// windows AND its fixed slots, so toggling a day's mode back and forth never
// loses the other set of times. `mode` decides which set is live: a day's
// AvailabilityRule rows are active only in OPEN_HOURS mode, its
// AvailabilitySlot rows only in FIXED_SLOTS mode.

const daySaveSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  mode: z.enum(["OPEN_HOURS", "FIXED_SLOTS"]),
  /** Open/closed toggle — only meaningful in OPEN_HOURS mode. */
  isActive: z.boolean(),
  windows: z.array(windowSchema).min(1, "Each day needs at least one time range").max(4),
  /** Hand-defined fixed slots. May be empty (a fixed-slots day with no slots
   * is simply closed that day). */
  fixedSlots: z.array(windowSchema).max(24),
});

function assertOrderedNonOverlapping(
  ranges: { startTime: string; endTime: string }[],
  dayName: string,
  noun: string,
): string | null {
  const sorted = [...ranges].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (const r of sorted) {
    if (r.endTime <= r.startTime) return `${dayName}: each ${noun}'s finish time must be after its start time.`;
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startTime < sorted[i - 1].endTime) {
      return `${dayName}: the ${noun}s overlap — adjust them so they don't.`;
    }
  }
  return null;
}

export async function saveWeeklyAvailability(days: z.infer<typeof daySaveSchema>[]): Promise<ActionResult> {
  await requireOwner();
  const parsed = z.array(daySaveSchema).length(7, "Provide all seven days").safeParse(days);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the availability entered." };
  }

  for (const d of parsed.data) {
    if (d.mode === "OPEN_HOURS" && d.isActive) {
      const err = assertOrderedNonOverlapping(d.windows, DAY_NAMES[d.dayOfWeek], "time range");
      if (err) return { status: "error", message: err };
    }
    if (d.mode === "FIXED_SLOTS") {
      const err = assertOrderedNonOverlapping(d.fixedSlots, DAY_NAMES[d.dayOfWeek], "slot");
      if (err) return { status: "error", message: err };
    }
  }

  await prisma.$transaction([
    // DaySchedule: one row per weekday holding the mode.
    ...parsed.data.map((d) =>
      prisma.daySchedule.upsert({
        where: { dayOfWeek: d.dayOfWeek },
        update: { mode: d.mode },
        create: { dayOfWeek: d.dayOfWeek, mode: d.mode },
      }),
    ),
    // Open-hours windows: remembered for every day, active only where the day
    // is OPEN_HOURS and switched on.
    prisma.availabilityRule.deleteMany({}),
    prisma.availabilityRule.createMany({
      data: parsed.data.flatMap((d) =>
        d.windows.map((w) => ({
          dayOfWeek: d.dayOfWeek,
          isActive: d.mode === "OPEN_HOURS" && d.isActive,
          startTime: w.startTime,
          endTime: w.endTime,
        })),
      ),
    }),
    // Fixed slots: remembered for every day, active only where the day is
    // FIXED_SLOTS.
    prisma.availabilitySlot.deleteMany({}),
    prisma.availabilitySlot.createMany({
      data: parsed.data.flatMap((d) =>
        d.fixedSlots.map((w) => ({
          dayOfWeek: d.dayOfWeek,
          isActive: d.mode === "FIXED_SLOTS",
          startTime: w.startTime,
          endTime: w.endTime,
        })),
      ),
    }),
  ]);

  revalidatePath("/admin/availability");
  revalidatePath("/admin/calendar");
  revalidatePath("/contact");
  revalidatePath("/book");
  return { status: "success" };
}

const exceptionSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
    type: z.enum(["CLOSED", "CUSTOM_HOURS", "CUSTOM_SLOTS"]),
    customStartTime: z.string().optional(),
    customEndTime: z.string().optional(),
    // For CUSTOM_SLOTS: the drop-off slots that apply to this one date only.
    customSlots: z.array(windowSchema).max(24).optional(),
    reason: z.string().optional(),
  })
  .refine((d) => d.type !== "CUSTOM_HOURS" || (d.customStartTime && d.customEndTime), {
    message: "Custom hours need both a start and end time.",
  })
  .refine((d) => d.type !== "CUSTOM_SLOTS" || (d.customSlots && d.customSlots.length > 0), {
    message: "Add at least one drop-off time for that date.",
  });

export async function addAvailabilityException(input: z.infer<typeof exceptionSchema>): Promise<ActionResult> {
  await requireOwner();
  const parsed = exceptionSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the details." };
  }
  const d = parsed.data;

  if (d.type === "CUSTOM_HOURS" && d.customEndTime! <= d.customStartTime!) {
    return { status: "error", message: "Custom hours: the finish time must be after the start time." };
  }
  if (d.type === "CUSTOM_SLOTS") {
    const err = assertOrderedNonOverlapping(d.customSlots!, "That date", "drop-off time");
    if (err) return { status: "error", message: err };
  }

  // customSlots is a JSON column — store the array for CUSTOM_SLOTS, SQL NULL otherwise.
  const fields = {
    type: d.type,
    customStartTime: d.type === "CUSTOM_HOURS" ? d.customStartTime : null,
    customEndTime: d.type === "CUSTOM_HOURS" ? d.customEndTime : null,
    customSlots: d.type === "CUSTOM_SLOTS" ? d.customSlots : Prisma.DbNull,
    reason: d.reason || null,
  };

  await prisma.availabilityException.upsert({
    where: { date: new Date(`${d.date}T00:00:00.000Z`) },
    update: fields,
    create: { date: new Date(`${d.date}T00:00:00.000Z`), ...fields },
  });

  revalidatePath("/admin/availability");
  revalidatePath("/admin/calendar");
  revalidatePath("/book");
  revalidatePath("/contact");
  return { status: "success" };
}

export async function deleteAvailabilityException(id: string): Promise<ActionResult> {
  await requireOwner();
  await prisma.availabilityException.delete({ where: { id } });
  revalidatePath("/admin/availability");
  revalidatePath("/book");
  revalidatePath("/contact");
  return { status: "success" };
}

// ── Special open days (a one-off open PERIOD, e.g. school holidays) ──────────
//
// Opens a RANGE of dates with hand-picked drop-off slots, WITHOUT touching the
// recurring weekly schedule. Implemented as one CUSTOM_SLOTS availability
// exception per date, so it reuses the same per-date override the booking engine
// already honours (a date with an open exception is bookable even if that weekday
// is normally closed). Clearing the range just deletes those exceptions.

const MAX_SPECIAL_DAYS = 92;

const specialOpenSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an end date"),
  slots: z.array(windowSchema).min(1, "Add at least one drop-off time").max(24),
  reason: z.string().max(120).optional(),
});

/** Enumerate the YYYY-MM-DD dates from start to end (inclusive), using UTC-midnight
 * math so it's calendar-correct and timezone-agnostic. Capped for safety. */
function enumerateDates(startDate: string, endDate: string): string[] | null {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  const dates: string[] = [];
  for (let t = start.getTime(); t <= end.getTime() && dates.length < MAX_SPECIAL_DAYS; t += 24 * 60 * 60_000) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

export async function createSpecialOpenDays(input: z.infer<typeof specialOpenSchema>): Promise<ActionResult> {
  await requireOwner();
  const parsed = specialOpenSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the details." };
  }
  const d = parsed.data;
  const slotErr = assertOrderedNonOverlapping(d.slots, "The drop-off times", "drop-off time");
  if (slotErr) return { status: "error", message: slotErr };

  const dates = enumerateDates(d.startDate, d.endDate);
  if (!dates) return { status: "error", message: "The end date must be on or after the start date." };

  await prisma.$transaction(
    dates.map((date) =>
      prisma.availabilityException.upsert({
        where: { date: new Date(`${date}T00:00:00.000Z`) },
        update: {
          type: "CUSTOM_SLOTS",
          customSlots: d.slots,
          customStartTime: null,
          customEndTime: null,
          reason: d.reason?.trim() || "Special open days",
        },
        create: {
          date: new Date(`${date}T00:00:00.000Z`),
          type: "CUSTOM_SLOTS",
          customSlots: d.slots,
          reason: d.reason?.trim() || "Special open days",
        },
      }),
    ),
  );

  revalidatePath("/admin/availability");
  revalidatePath("/admin/calendar");
  revalidatePath("/book");
  revalidatePath("/contact");
  return { status: "success" };
}

/** Removes every one-off exception in a date range — the "undo" for a special
 * open period (or any batch of one-off days). */
export async function clearExceptionsInRange(startDate: string, endDate: string): Promise<ActionResult> {
  await requireOwner();
  const dates = enumerateDates(startDate, endDate);
  if (!dates) return { status: "error", message: "The end date must be on or after the start date." };

  await prisma.availabilityException.deleteMany({
    where: { date: { in: dates.map((date) => new Date(`${date}T00:00:00.000Z`)) } },
  });

  revalidatePath("/admin/availability");
  revalidatePath("/admin/calendar");
  revalidatePath("/book");
  revalidatePath("/contact");
  return { status: "success" };
}
