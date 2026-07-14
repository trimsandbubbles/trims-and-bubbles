"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffOrOwner } from "@/lib/session";

const dayScheduleSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  isActive: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
});

export type ActionResult = { status: "success" } | { status: "error"; message: string };

export async function updateWeeklyHours(days: z.infer<typeof dayScheduleSchema>[]): Promise<ActionResult> {
  await requireStaffOrOwner();
  const parsed = z.array(dayScheduleSchema).safeParse(days);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the hours entered." };
  }
  for (const d of parsed.data) {
    if (d.isActive && d.endTime <= d.startTime) {
      return { status: "error", message: "Closing time must be after opening time." };
    }
  }

  await prisma.$transaction(
    parsed.data.map((d) =>
      prisma.availabilityRule.upsert({
        where: { dayOfWeek: d.dayOfWeek },
        update: { isActive: d.isActive, startTime: d.startTime, endTime: d.endTime },
        create: { dayOfWeek: d.dayOfWeek, isActive: d.isActive, startTime: d.startTime, endTime: d.endTime },
      }),
    ),
  );

  revalidatePath("/admin/availability");
  revalidatePath("/contact");
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
