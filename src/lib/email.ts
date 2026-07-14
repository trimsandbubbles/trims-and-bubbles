import "server-only";

/**
 * Transactional email for Trims and Bubbles.
 *
 * Uses Resend's REST API directly via `fetch` (no SDK dependency, works on
 * serverless/edge). It is deliberately fail-soft: if `RESEND_API_KEY` is not set
 * (the current state until the owner creates a Resend account and verifies a
 * sending domain), emails are logged to the server console instead of sent, and
 * nothing throws — a failed notification must never break a booking or an order.
 *
 * To go live: set RESEND_API_KEY and EMAIL_FROM (a verified domain sender) in the
 * environment. See DEPLOYMENT.md. Owner notifications go to OWNER_NOTIFICATION_EMAIL
 * if set, otherwise the business contact email.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Best-effort send. Returns true if sent (or logged in dev), false on failure. */
export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const from = process.env.EMAIL_FROM || "Trims and Bubbles <onboarding@resend.dev>";

  if (!isEmailConfigured()) {
    // Dev stand-in — same approach as the contact form. Nothing is actually sent.
    console.log("[email — not sent, RESEND_API_KEY unset]", {
      to: input.to,
      subject: input.subject,
    });
    return true;
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        reply_to: input.replyTo,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[email] Resend send failed:", res.status, detail);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Resend send threw:", err);
    return false;
  }
}

/** Minimal HTML escaping for interpolating user-supplied text into email bodies. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Wraps body HTML in a simple, email-client-safe branded shell. */
export function emailLayout(bodyHtml: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1E1816;">
  <div style="background:#DA5B4A;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:700;font-size:18px;">Trims &amp; Bubbles</div>
  <div style="border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:20px;background:#FBF6EC;">
    ${bodyHtml}
  </div>
</div>`;
}
