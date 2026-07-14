"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffOrOwner, requireSession } from "@/lib/session";
import { sendEmail, escapeHtml, emailLayout } from "@/lib/email";
import type { ActionResult } from "@/lib/actions/pets";

const sendMessageSchema = z.object({
  clientId: z.string().min(1),
  subject: z.string().max(150, "That subject is too long").optional(),
  body: z.string().min(1, "Please write a message").max(5000, "That message is too long"),
});

export async function sendClientMessage(input: z.infer<typeof sendMessageSchema>): Promise<ActionResult> {
  const session = await requireStaffOrOwner();
  const parsed = sendMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the message." };
  }
  const { clientId, subject, body } = parsed.data;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { user: true },
  });
  if (!client) {
    return { status: "error", message: "That client could not be found." };
  }

  const trimmedSubject = subject?.trim() || null;
  const emailConfigured = Boolean(process.env.RESEND_API_KEY);

  const message = await prisma.clientMessage.create({
    data: {
      clientId,
      subject: trimmedSubject,
      body: body.trim(),
      sentByUserId: session.user.id,
      emailedAt: emailConfigured ? new Date() : null,
    },
  });

  // Best-effort email — sendEmail is fail-soft, so this never breaks the save.
  const emailSubject = trimmedSubject ?? "A message from Trims & Bubbles";
  const bodyHtml = escapeHtml(message.body).replace(/\n/g, "<br/>");
  const emailBody = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(client.user.name)},</p>
    <p style="margin:0 0 12px;">${bodyHtml}</p>
    <p style="margin:0;">— The Trims &amp; Bubbles team</p>
  `;
  await sendEmail({
    to: client.user.email,
    subject: emailSubject,
    html: emailLayout(emailBody),
    text: message.body,
  });

  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/portal/messages");
  return { status: "success" };
}

/**
 * Marks the CURRENT session's own unread messages as read. Resolves the Client
 * from the session user id — never from client input — so a client can only ever
 * touch their own rows.
 */
export async function markMessagesRead(): Promise<void> {
  const session = await requireSession();
  const client = await prisma.client.findUnique({ where: { userId: session.user.id } });
  if (!client) return;
  await prisma.clientMessage.updateMany({
    where: { clientId: client.id, readAt: null },
    data: { readAt: new Date() },
  });
}
