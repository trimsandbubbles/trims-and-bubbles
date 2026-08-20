"use server";

import { z } from "zod";
import { sendEmail, escapeHtml, emailLayout } from "@/lib/email";
import { getOwnerEmail } from "@/lib/owner-email";

const contactSchema = z.object({
  name: z.string().min(1, "Please enter your name").max(100, "That name is too long"),
  email: z.string().email("Please enter a valid email").max(200),
  message: z.string().min(1, "Please enter a message").max(3000, "That message is too long"),
});

export type ContactFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function submitContactForm(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const parsed = contactSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    message: formData.get("message"),
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check your details." };
  }
  const { name, email, message } = parsed.data;

  // Email the owner the enquiry, with reply-to set to the SENDER so the owner
  // can reply straight to them (the opposite of our customer-facing emails).
  // Best-effort: sendEmail is fail-soft, and we always thank the sender so a
  // transient email hiccup never looks like a broken form.
  const body = `
    <p style="margin:0 0 12px;">New message from your website contact form:</p>
    <p style="margin:0 0 6px;"><strong>${escapeHtml(name)}</strong> (${escapeHtml(email)})</p>
    <p style="margin:0 0 12px;white-space:pre-wrap;">${escapeHtml(message)}</p>
  `;
  await sendEmail({
    to: await getOwnerEmail(),
    subject: `New enquiry from ${name}`,
    html: emailLayout(body),
    text: `New contact-form message from ${name} (${email}):\n\n${message}`,
    replyTo: email,
  });

  return { status: "success", message: "Thanks — we'll get back to you shortly." };
}
