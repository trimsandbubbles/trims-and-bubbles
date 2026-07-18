"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession, requireOwner } from "@/lib/session";
import type { ActionResult } from "@/lib/actions/pets";

/** Public reviews page, the owner's moderation tab, and the client's own copy
 * in the portal all need refreshing whenever a review changes. */
function revalidateReviewSurfaces() {
  revalidatePath("/reviews");
  revalidatePath("/admin/reviews");
  revalidatePath("/portal/reviews");
  revalidatePath("/portal");
}

const submitReviewSchema = z.object({
  rating: z.number().int().min(1, "Please pick a star rating").max(5, "Please pick a star rating"),
  body: z
    .string()
    .trim()
    .min(1, "Please write a short comment")
    .max(2000, "That review is a little long — please shorten it"),
});

/**
 * A logged-in client leaves (or updates) their review. The Client row is
 * resolved from the session — never from client input — so a client can only
 * ever touch their own review. Any submit resets `approved` to false so the
 * owner sees and approves the current wording before it appears publicly.
 */
export async function submitReview(input: z.infer<typeof submitReviewSchema>): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = submitReviewSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check your review." };
  }
  const { rating, body } = parsed.data;

  // Staff/owner accounts aren't customers — keep the reviews list to real clients.
  if (session.user.role === "staff" || session.user.role === "owner") {
    return { status: "error", message: "Reviews can only be left from a client account." };
  }

  // Lazily create the Client row (mirrors how pets.ts handles first-time clients).
  const client = await prisma.client.upsert({
    where: { userId: session.user.id },
    update: {},
    create: { userId: session.user.id },
  });

  await prisma.review.upsert({
    where: { clientId: client.id },
    update: { rating, body, approved: false, hidden: false },
    create: { clientId: client.id, rating, body },
  });

  revalidateReviewSurfaces();
  return { status: "success" };
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
