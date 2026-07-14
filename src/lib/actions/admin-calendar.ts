"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffOrOwner } from "@/lib/session";

export async function createBlockedTimeSlot(startAtIso: string, endAtIso: string, reason?: string) {
  const session = await requireStaffOrOwner();
  const startAt = new Date(startAtIso);
  const endAt = new Date(endAtIso);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    return { status: "error" as const, message: "Invalid time range." };
  }

  await prisma.blockedTimeSlot.create({
    data: { startAt, endAt, reason: reason?.trim() || "Blocked", createdByUserId: session.user.id },
  });
  revalidatePath("/admin/calendar");
  return { status: "success" as const };
}

export async function deleteBlockedTimeSlot(id: string) {
  await requireStaffOrOwner();
  await prisma.blockedTimeSlot.delete({ where: { id } });
  revalidatePath("/admin/calendar");
  return { status: "success" as const };
}
