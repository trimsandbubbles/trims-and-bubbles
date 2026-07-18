"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, requireOwner } from "@/lib/session";
import { validateAndProcessImage, saveImage, deleteImage, InvalidImageError } from "@/lib/uploads";
import type { ActionResult } from "@/lib/actions/pets";

/** How many photos a client may attach to their review. */
const MAX_REVIEW_PHOTOS = 3;

/** Public reviews page, the owner's moderation tab, and the client's own copy
 * in the portal all need refreshing whenever a review changes. */
function revalidateReviewSurfaces() {
  revalidatePath("/reviews");
  revalidatePath("/admin/reviews");
  revalidatePath("/portal/reviews");
  revalidatePath("/portal");
}

const submitReviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Please pick a star rating").max(5, "Please pick a star rating"),
  body: z
    .string()
    .trim()
    .min(1, "Please write a short comment")
    .max(2000, "That review is a little long — please shorten it"),
  displayName: z.string().trim().max(40, "That name is a little long").optional(),
});

export type SubmitReviewResult =
  | { status: "success"; photoUrls: string[] }
  | { status: "error"; message: string };

/**
 * A logged-in client leaves (or updates) their review — star rating, comment,
 * an optional display name, and up to {@link MAX_REVIEW_PHOTOS} photos. The
 * Client row is resolved from the session — never from client input — so a
 * client can only ever touch their own review. Any submit resets `approved` to
 * false so the owner re-approves the current version before it appears publicly.
 */
export async function submitReview(formData: FormData): Promise<SubmitReviewResult> {
  const session = await requireSession();

  // Staff/owner accounts aren't customers — keep the reviews list to real clients.
  if (session.user.role === "staff" || session.user.role === "owner") {
    return { status: "error", message: "Reviews can only be left from a client account." };
  }

  const parsed = submitReviewSchema.safeParse({
    rating: formData.get("rating"),
    body: formData.get("body"),
    displayName: formData.get("displayName") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check your review." };
  }
  const { rating, body } = parsed.data;
  const displayName = parsed.data.displayName?.trim() || null;

  // Lazily create the Client row (mirrors how pets.ts handles first-time clients).
  const client = await prisma.client.upsert({
    where: { userId: session.user.id },
    update: {},
    create: { userId: session.user.id },
  });

  const existing = await prisma.review.findUnique({ where: { clientId: client.id } });
  const existingUrls = existing?.photoUrls ?? [];

  // Which existing photos the client chose to keep — validated against what's
  // actually on THEIR review, so no arbitrary URL can be injected.
  let keepUrls: string[] = [];
  const keepRaw = formData.get("keepUrls");
  if (typeof keepRaw === "string" && keepRaw) {
    try {
      const parsedKeep: unknown = JSON.parse(keepRaw);
      if (Array.isArray(parsedKeep)) {
        keepUrls = parsedKeep.filter((u): u is string => typeof u === "string" && existingUrls.includes(u));
      }
    } catch {
      keepUrls = [];
    }
  }

  const newFiles = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);

  if (keepUrls.length + newFiles.length > MAX_REVIEW_PHOTOS) {
    return { status: "error", message: `Please keep it to ${MAX_REVIEW_PHOTOS} photos or fewer.` };
  }

  // Run every new photo through the shared safe-image pipeline (magic-byte
  // sniff, re-encode, EXIF/GPS strip). If any one fails, roll back the files we
  // already saved so we never leave a half-finished upload set behind.
  const newUrls: string[] = [];
  try {
    for (const file of newFiles) {
      const processed = await validateAndProcessImage(await file.arrayBuffer());
      newUrls.push(await saveImage(processed, "reviews"));
    }
  } catch (err) {
    await Promise.all(newUrls.map((u) => deleteImage(u)));
    const message =
      err instanceof InvalidImageError
        ? err.message
        : "One of those photos couldn't be uploaded — please try a JPG, PNG or WebP.";
    return { status: "error", message };
  }

  const photoUrls = [...keepUrls, ...newUrls];

  await prisma.review.upsert({
    where: { clientId: client.id },
    update: { rating, body, displayName, photoUrls, approved: false, hidden: false },
    create: { clientId: client.id, rating, body, displayName, photoUrls },
  });

  // Best-effort cleanup of any photos the client removed this time.
  const removed = existingUrls.filter((u) => !keepUrls.includes(u));
  await Promise.all(removed.map((u) => deleteImage(u)));

  revalidateReviewSurfaces();
  return { status: "success", photoUrls };
}

const reviewIdSchema = z.object({ reviewId: z.string().min(1) });

/** Owner-only: make a pending review public. */
export async function approveReview(input: z.infer<typeof reviewIdSchema>): Promise<ActionResult> {
  await requireOwner();
  const parsed = reviewIdSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Could not find that review." };
  await prisma.review.update({
    where: { id: parsed.data.reviewId },
    data: { approved: true, hidden: false },
  });
  revalidateReviewSurfaces();
  return { status: "success" };
}

const setHiddenSchema = z.object({ reviewId: z.string().min(1), hidden: z.boolean() });

/** Owner-only: hide a review from the public site (keeps it, doesn't delete). */
export async function setReviewHidden(input: z.infer<typeof setHiddenSchema>): Promise<ActionResult> {
  await requireOwner();
  const parsed = setHiddenSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Could not update that review." };
  await prisma.review.update({
    where: { id: parsed.data.reviewId },
    data: { hidden: parsed.data.hidden },
  });
  revalidateReviewSurfaces();
  return { status: "success" };
}

/** Owner-only: permanently delete a review. */
export async function deleteReview(input: z.infer<typeof reviewIdSchema>): Promise<ActionResult> {
  await requireOwner();
  const parsed = reviewIdSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Could not find that review." };
  await prisma.review.delete({ where: { id: parsed.data.reviewId } });
  revalidateReviewSurfaces();
  return { status: "success" };
}

const replySchema = z.object({
  reviewId: z.string().min(1),
  reply: z.string().trim().max(1000, "That reply is a little long — please shorten it"),
});

/** Owner-only: add (or clear, by sending an empty string) a public reply. */
export async function replyToReview(input: z.infer<typeof replySchema>): Promise<ActionResult> {
  await requireOwner();
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check your reply." };
  }
  const reply = parsed.data.reply.trim();
  await prisma.review.update({
    where: { id: parsed.data.reviewId },
    data: reply
      ? { ownerReply: reply, ownerReplyAt: new Date() }
      : { ownerReply: null, ownerReplyAt: null },
  });
  revalidateReviewSurfaces();
  return { status: "success" };
}
