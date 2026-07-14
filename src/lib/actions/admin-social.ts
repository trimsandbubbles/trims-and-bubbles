"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/session";
import type { ActionResult } from "@/lib/actions/pets";

/** A social link is optional/blank, capped at 200 chars, and — when filled in —
 * must be a full https:// link so it opens correctly from the footer. */
const socialUrl = z
  .string()
  .max(200, "Keep the link under 200 characters")
  .refine((v) => v === "" || v.startsWith("https://"), "Links need to start with https://")
  .optional()
  .or(z.literal(""));

const socialSchema = z.object({
  instagramUrl: socialUrl,
  facebookUrl: socialUrl,
  tiktokUrl: socialUrl,
  youtubeUrl: socialUrl,
});

/** Owner-only: the public social media links shown as icons in the site footer. */
export async function updateSocialLinks(input: z.infer<typeof socialSchema>): Promise<ActionResult> {
  await requireOwner();
  const parsed = socialSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the links." };
  }
  const d = parsed.data;

  const fields = {
    instagramUrl: d.instagramUrl?.trim() || null,
    facebookUrl: d.facebookUrl?.trim() || null,
    tiktokUrl: d.tiktokUrl?.trim() || null,
    youtubeUrl: d.youtubeUrl?.trim() || null,
  };

  await prisma.businessSettings.upsert({
    where: { id: 1 },
    update: fields,
    create: { id: 1, ...fields },
  });

  revalidatePath("/");
  revalidatePath("/contact");
  revalidatePath("/about");
  revalidatePath("/admin/social");
  return { status: "success" };
}
