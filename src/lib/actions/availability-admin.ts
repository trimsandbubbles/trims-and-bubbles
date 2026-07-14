"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffOrOwner } from "@/lib/session";

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
  await requireStaffOrOwner();
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

const exceptionSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
    type: z.enum(["CLOSED", "CUSTOM_HOURS"]),
    customStartTime: z.string().optional(),
    customEndTime: z.string().optional(),
    reason: z.string().optional(),
  })
  .refine((d) => d.type === "CLOSED" || (d.customStartTime && d.customEndTime), {
    message: "Custom hours need both a start and end time.",
  });

export async function addAvailabilityException(input: z.infer<typeof exceptionSchema>): Promise<ActionResult> {
  await requireStaffOrOwner();
  const parsed = exceptionSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the details." };
  }
  const d = parsed.data;

  await prisma.availabilityException.upsert({
    where: { date: new Date(`${d.date}T00:00:00.000Z`) },
    update: {
      type: d.type,
      customStartTime: d.type === "CUSTOM_HOURS" ? d.customStartTime : null,
      customEndTime: d.type === "CUSTOM_HOURS" ? d.customEndTime : null,
      reason: d.reason || null,
    },
    create: {
      date: new Date(`${d.date}T00:00:00.000Z`),
      type: d.type,
      customStartTime: d.type === "CUSTOM_HOURS" ? d.customStartTime : null,
      customEndTime: d.type === "CUSTOM_HOURS" ? d.customEndTime : null,
      reason: d.reason || null,
    },
  });

  revalidatePath("/admin/availability");
  return { status: "success" };
}

export async function deleteAvailabilityException(id: string): Promise<ActionResult> {
  await requireStaffOrOwner();
  await prisma.availabilityException.delete({ where: { id } });
  revalidatePath("/admin/availability");
  return { status: "success" };
}
