"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import type { ActionResult } from "@/lib/actions/pets";

// .trim() first, so a whitespace-only entry is rejected instead of being saved
// as a phone number the owner can't actually call.
const phoneSchema = z.string().trim().min(1, "Enter a phone number").max(30, "That phone number is too long");

export async function updateMyPhone(phone: string): Promise<ActionResult> {
  const parsed = phoneSchema.safeParse(phone);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check your phone number." };
  }
  const session = await requireSession();
  await prisma.client.upsert({
    where: { userId: session.user.id },
    update: { phone: parsed.data },
    create: { userId: session.user.id, phone: parsed.data },
  });
  revalidatePath("/portal/profile");
  return { status: "success" };
}

export async function updateMarketingOptIn(marketingOptIn: boolean): Promise<ActionResult> {
  const session = await requireSession();
  await prisma.client.upsert({
    where: { userId: session.user.id },
    update: { marketingOptIn },
    create: { userId: session.user.id, marketingOptIn },
  });
  revalidatePath("/portal/profile");
  return { status: "success" };
}
