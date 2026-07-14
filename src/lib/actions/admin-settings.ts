"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/session";
import type { ActionResult } from "@/lib/actions/pets";

const settingsSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email("Enter a valid email").optional().or(z.literal("")),
  depositPercentage: z.number().int().min(0).max(100),
  bufferMinutes: z.number().int().min(0).max(120),
  fullAddress: z.string().max(200, "Keep the address under 200 characters").optional().or(z.literal("")),
  serviceAreaNote: z.string().max(300, "Keep the note under 300 characters").optional().or(z.literal("")),
  credentialTitle: z.string().max(120, "Keep the qualification title under 120 characters").optional().or(z.literal("")),
  credentialInstitution: z
    .string()
    .max(160, "Keep the institution name under 160 characters")
    .optional()
    .or(z.literal("")),
});

/** Owner-only: the day-to-day operational settings (kept separate from the
 * one-time launch placeholders in src/config/business.ts — see that file's
 * header comment for why). */
export async function updateBusinessSettings(input: z.infer<typeof settingsSchema>): Promise<ActionResult> {
  await requireOwner();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the details." };
  }
  const d = parsed.data;

  const fields = {
    businessName: d.businessName,
    contactPhone: d.contactPhone?.trim() || null,
    contactEmail: d.contactEmail?.trim() || null,
    depositPercentage: d.depositPercentage,
    bufferMinutes: d.bufferMinutes,
    fullAddress: d.fullAddress?.trim() || null,
    serviceAreaNote: d.serviceAreaNote?.trim() || null,
    credentialTitle: d.credentialTitle?.trim() || null,
    credentialInstitution: d.credentialInstitution?.trim() || null,
  };

  await prisma.businessSettings.upsert({
    where: { id: 1 },
    update: fields,
    create: { id: 1, ...fields },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/contact");
  revalidatePath("/about");
  revalidatePath("/");
  revalidatePath("/services");
  return { status: "success" };
}
