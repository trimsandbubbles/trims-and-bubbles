"use server";

import { z } from "zod";

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

  // Dev stand-in for real email delivery — swap for Resend (see RESEND_API_KEY
  // in .env) once you have a verified sending domain. See DEPLOYMENT.md.
  console.log("[contact form submission]", parsed.data);

  return { status: "success", message: "Thanks — we'll get back to you shortly." };
}
