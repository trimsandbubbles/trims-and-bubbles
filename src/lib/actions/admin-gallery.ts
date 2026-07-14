"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffOrOwner } from "@/lib/session";
import type { ActionResult } from "@/lib/actions/pets";
import { validateAndProcessImage, saveImage, deleteImage } from "@/lib/uploads";

/** Both the owner-facing manager and the public gallery read from these
 * routes, so every mutation below revalidates both. */
function revalidateGallery() {
  revalidatePath("/admin/gallery");
  revalidatePath("/gallery");
}

const captionSchema = z.string().max(200, "Caption is too long (200 characters max).").optional();
const groupLabelSchema = z.string().max(80, "Group name is too long (80 characters max).").optional();

/**
 * Adds a standalone gallery photo. FormData (not a typed object) so it can
 * carry the actual image File straight from a phone's file/camera picker,
 * mirroring completeAppointmentWithPhoto's pattern.
 */
export async function addGalleryImage(formData: FormData): Promise<ActionResult> {
  await requireStaffOrOwner();

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { status: "error", message: "Please choose a photo to upload." };
  }

  const captionParsed = captionSchema.safeParse(String(formData.get("caption") || "").trim() || undefined);
  const groupLabelParsed = groupLabelSchema.safeParse(String(formData.get("groupLabel") || "").trim() || undefined);
  if (!captionParsed.success) {
    return { status: "error", message: captionParsed.error.issues[0]?.message ?? "Please check the caption." };
  }
  if (!groupLabelParsed.success) {
    return { status: "error", message: groupLabelParsed.error.issues[0]?.message ?? "Please check the group name." };
  }

  let url: string;
  try {
    const processed = await validateAndProcessImage(await photo.arrayBuffer());
    url = await saveImage(processed, "gallery");
  } catch {
    return {
      status: "error",
      message: "That file doesn't look like a photo — please upload a JPG, PNG or WebP image.",
    };
  }

  const maxOrder = await prisma.galleryImage.aggregate({ _max: { displayOrder: true } });
  const displayOrder = (maxOrder._max.displayOrder ?? -1) + 1;

  await prisma.galleryImage.create({
    data: {
      url,
      caption: captionParsed.data ?? null,
      groupLabel: groupLabelParsed.data ?? null,
      displayOrder,
    },
  });

  revalidateGallery();
  return { status: "success" };
}

const updateGalleryImageSchema = z.object({
  caption: z.string().max(200, "Caption is too long (200 characters max).").optional(),
  groupLabel: z.string().max(80, "Group name is too long (80 characters max).").optional(),
  displayOrder: z.number().int().min(0).max(100000).optional(),
  active: z.boolean().optional(),
});

export type UpdateGalleryImageInput = z.infer<typeof updateGalleryImageSchema>;

/** Patches caption/groupLabel/displayOrder/active on a standalone gallery
 * image. Empty-string caption/groupLabel are treated as "clear this field". */
export async function updateGalleryImage(id: string, input: UpdateGalleryImageInput): Promise<ActionResult> {
  await requireStaffOrOwner();
  if (!id) return { status: "error", message: "Missing photo." };

  const parsed = updateGalleryImageSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the details." };
  }
  const d = parsed.data;

  const existing = await prisma.galleryImage.findUnique({ where: { id } });
  if (!existing) return { status: "error", message: "That photo no longer exists." };

  await prisma.galleryImage.update({
    where: { id },
    data: {
      ...(d.caption !== undefined && { caption: d.caption.trim() || null }),
      ...(d.groupLabel !== undefined && { groupLabel: d.groupLabel.trim() || null }),
      ...(d.displayOrder !== undefined && { displayOrder: d.displayOrder }),
      ...(d.active !== undefined && { active: d.active }),
    },
  });

  revalidateGallery();
  return { status: "success" };
}

/** Deletes a standalone gallery image: best-effort remove the file from
 * disk, then always drop the row (a missing file should never block undoing
 * a mistaken upload). */
export async function deleteGalleryImage(id: string): Promise<ActionResult> {
  await requireStaffOrOwner();
  if (!id) return { status: "error", message: "Missing photo." };

  const existing = await prisma.galleryImage.findUnique({ where: { id } });
  if (!existing) return { status: "error", message: "That photo no longer exists." };

  try {
    await deleteImage(existing.url);
  } catch {
    // Best-effort: file already gone or otherwise unreachable.
  }

  await prisma.galleryImage.delete({ where: { id } });

  revalidateGallery();
  return { status: "success" };
}

/** Toggles whether a completed appointment's photo is shown on the public
 * gallery, so the owner can feature (or unfeature) real grooms from her
 * phone without a developer touching the seed data. */
export async function setAppointmentPhotoFeatured(photoId: string, featured: boolean): Promise<ActionResult> {
  await requireStaffOrOwner();
  if (!photoId) return { status: "error", message: "Missing photo." };

  const existing = await prisma.appointmentPhoto.findUnique({ where: { id: photoId } });
  if (!existing) return { status: "error", message: "That photo no longer exists." };

  await prisma.appointmentPhoto.update({
    where: { id: photoId },
    data: { isFeaturedOnPublicGallery: featured },
  });

  revalidateGallery();
  return { status: "success" };
}
