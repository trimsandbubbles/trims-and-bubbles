"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/session";
import { validateAndProcessImage, saveImage, InvalidImageError } from "@/lib/uploads";

/**
 * Owner-only inline editing of the marketing site's text and images.
 *
 * Every mutation calls `revalidatePath("/", "layout")`: in Next 16 that
 * revalidates the whole route subtree rendered under the root layout, so any
 * marketing page reading the same SiteContent key picks up the change on the
 * next render — no per-page revalidate list to keep in sync.
 */

type TextResult = { status: "success" } | { status: "error"; message: string };
type ImageResult = { status: "success"; url: string } | { status: "error"; message: string };

const keySchema = z.string().min(1, "Missing content key.").max(100, "Content key is too long.");
const textValueSchema = z.string().max(5000, "That text is too long (5000 characters max).");

/** Upsert a text override for `key`, then revalidate the marketing subtree. */
export async function updateSiteText(key: string, value: string): Promise<TextResult> {
  await requireOwner();

  const keyParsed = keySchema.safeParse(key);
  if (!keyParsed.success) {
    return { status: "error", message: keyParsed.error.issues[0]?.message ?? "Invalid content key." };
  }
  const valueParsed = textValueSchema.safeParse(value);
  if (!valueParsed.success) {
    return { status: "error", message: valueParsed.error.issues[0]?.message ?? "Please check the text." };
  }

  try {
    await prisma.siteContent.upsert({
      where: { key: keyParsed.data },
      update: { kind: "text", value: valueParsed.data },
      create: { key: keyParsed.data, kind: "text", value: valueParsed.data },
    });
  } catch {
    return { status: "error", message: "Something went wrong saving your change. Please try again." };
  }

  revalidatePath("/", "layout");
  return { status: "success" };
}

/**
 * Upsert an image override for `key`. The uploaded "photo" File is run through
 * the shared safe-image pipeline (magic-byte sniff + re-encode, strips EXIF),
 * stored under `public/uploads/site`, and its public URL saved as the value.
 */
export async function updateSiteImage(key: string, formData: FormData): Promise<ImageResult> {
  await requireOwner();

  const keyParsed = keySchema.safeParse(key);
  if (!keyParsed.success) {
    return { status: "error", message: keyParsed.error.issues[0]?.message ?? "Invalid content key." };
  }

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { status: "error", message: "Please choose a photo to upload." };
  }

  let url: string;
  try {
    const processed = await validateAndProcessImage(await photo.arrayBuffer());
    url = await saveImage(processed, "site");
  } catch (err) {
    // Surface the pipeline's own friendly, specific message (e.g. the
    // "too large — under 12MB" hint) verbatim; fall back to the generic
    // wrong-file-type message for any other failure (e.g. disk write).
    const message =
      err instanceof InvalidImageError
        ? err.message
        : "That file doesn't look like a photo — please upload a JPG, PNG or WebP image.";
    return { status: "error", message };
  }

  try {
    await prisma.siteContent.upsert({
      where: { key: keyParsed.data },
      update: { kind: "image", value: url },
      create: { key: keyParsed.data, kind: "image", value: url },
    });
  } catch {
    return { status: "error", message: "Something went wrong saving your photo. Please try again." };
  }

  revalidatePath("/", "layout");
  return { status: "success", url };
}
