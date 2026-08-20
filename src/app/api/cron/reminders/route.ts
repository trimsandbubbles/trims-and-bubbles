import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sydneyCalendarDayRange } from "@/lib/availability-data";
import { getBusinessSettings } from "@/lib/services-data";
import { getOwnerEmail } from "@/lib/owner-email";
import { sendEmail, escapeHtml, emailLayout } from "@/lib/email";

/**
 * Daily job (Vercel Cron) that emails a friendly "your appointment is in 2 days"
 * reminder — with the drop-off address again — to every customer whose booking
 * falls on the date two days out.
 *
 * Idempotent: each appointment carries `reminderSentAt`, set once here, so a
 * second run the same day never double-sends. A multi-dog booking (several rows
 * sharing a bookingGroupId) gets ONE email listing every dog.
 *
 * Protected by CRON_SECRET: Vercel Cron sends it as a Bearer token; a request
 * without it is rejected, so the endpoint can't be triggered by the public.
 */

export const dynamic = "force-dynamic";

const REMIND_DAYS_AHEAD = 2;

const WHEN_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
});

/** The Sydney calendar date REMIND_DAYS_AHEAD days from today, as YYYY-MM-DD. */
function targetDateStr(): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + REMIND_DAYS_AHEAD)).toISOString().slice(0, 10);
}

/** Placeholder addresses for call-in customers with no email — never mailed. */
function isEmailable(email: string | null | undefined): email is string {
  return !!email && !email.endsWith("trimsandbubbles.invalid");
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateStr = targetDateStr();
  const { start, end } = sydneyCalendarDayRange(dateStr);

  const appts = await prisma.appointment.findMany({
    where: {
      startAt: { gte: start, lt: end },
      status: { in: ["CONFIRMED", "PENDING_PAYMENT", "IN_PROGRESS"] },
      reminderSentAt: null,
    },
    include: {
      client: { include: { user: true } },
      pet: true,
      primaryService: true,
      addOns: { include: { service: true } },
    },
    orderBy: { startAt: "asc" },
  });

  if (appts.length === 0) {
    return NextResponse.json({ ok: true, date: dateStr, groups: 0, reminded: 0 });
  }

  // Group by bookingGroupId (fall back to the row id) so a multi-dog booking
  // gets a single reminder.
  const groups = new Map<string, typeof appts>();
  for (const a of appts) {
    const key = a.bookingGroupId ?? a.id;
    const arr = groups.get(key);
    if (arr) arr.push(a);
    else groups.set(key, [a]);
  }

  const [settings, ownerEmail] = await Promise.all([getBusinessSettings(), getOwnerEmail()]);
  const address = settings.bookingAddress || null;

  let reminded = 0;
  for (const group of groups.values()) {
    const first = group[0];
    const to = first.client.user.email;
    if (isEmailable(to)) {
      await sendReminder({
        to,
        customerName: first.client.user.name,
        startAt: first.startAt,
        dogs: group.map((g) => ({
          petName: g.pet.name,
          services: [g.primaryService.name, ...g.addOns.map((x) => x.service.name)],
        })),
        address,
        replyTo: ownerEmail,
      });
    }
    // Mark sent regardless (email is best-effort) so we never re-process daily.
    await prisma.appointment.updateMany({
      where: { id: { in: group.map((g) => g.id) } },
      data: { reminderSentAt: new Date() },
    });
    reminded += group.length;
  }

  return NextResponse.json({ ok: true, date: dateStr, groups: groups.size, reminded });
}

async function sendReminder(n: {
  to: string;
  customerName: string;
  startAt: Date;
  dogs: { petName: string; services: string[] }[];
  address: string | null;
  replyTo: string;
}): Promise<void> {
  const when = WHEN_FMT.format(n.startAt);
  const listHtml = `<ul style="margin:0 0 12px;padding-left:18px;">${n.dogs
    .map((d) => `<li style="margin:0 0 4px;"><strong>${escapeHtml(d.petName)}</strong> — ${escapeHtml(d.services.join(" + "))}</li>`)
    .join("")}</ul>`;
  const listText = n.dogs.map((d) => `${d.petName}: ${d.services.join(" + ")}`).join("; ");
  const addressHtml = n.address
    ? `<p style="margin:0 0 12px;">Drop-off address: <strong>${escapeHtml(n.address)}</strong></p>`
    : "";
  const addressText = n.address ? ` Drop-off address: ${n.address}.` : "";

  const body = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(n.customerName)},</p>
    <p style="margin:0 0 12px;">Just a friendly reminder — your Trims &amp; Bubbles appointment is coming up in 2 days. 🐾</p>
    <p style="margin:0 0 6px;">When: <strong>${escapeHtml(when)}</strong></p>
    ${listHtml}
    ${addressHtml}
    <p style="margin:0 0 12px;">Payment is in person on the day (cash). If anything's changed, just reply to this email and we'll sort it out.</p>
    <p style="margin:0;">See you soon,<br/>The Trims &amp; Bubbles team</p>
  `;

  await sendEmail({
    to: n.to,
    subject: `Reminder: your appointment on ${when}`,
    html: emailLayout(body),
    text: `Hi ${n.customerName}, a friendly reminder your Trims & Bubbles appointment is in 2 days — ${when}. ${listText}.${addressText} Payment in person (cash). See you soon!`,
    replyTo: n.replyTo,
  });
}
