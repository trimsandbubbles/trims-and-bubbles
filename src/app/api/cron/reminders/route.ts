import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sydneyCalendarDayRange } from "@/lib/availability-data";
import { getBusinessSettings } from "@/lib/services-data";
import { getOwnerEmail } from "@/lib/owner-email";
import { sendEmail, escapeHtml, emailLayout } from "@/lib/email";

/**
 * The daily customer-emails job (Vercel Cron). It does two things, both
 * idempotent (a per-appointment "sent at" flag stops any double-send):
 *
 *  1. Upcoming-appointment reminders — a friendly "your appointment is coming
 *     up" email (with the drop-off address) for bookings in the next ~2 days.
 *  2. Rebooking nudges — a gentle "time for their next groom?" email a
 *     configurable number of weeks after a past visit, IF the customer hasn't
 *     already booked again. Turned off when Settings → rebook weeks is 0.
 *
 * Protected by CRON_SECRET, which Vercel Cron sends as a Bearer token.
 */

export const dynamic = "force-dynamic";

const REMIND_DAYS_AHEAD = 2;
const SITE_URL = "https://trimsandbubbles.com.au";
// How far back past the target the rebook window reaches, so a missed run (or a
// visit that lands a few days off the exact week) still gets one nudge.
const REBOOK_WINDOW_DAYS = 14;

const WHEN_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
});

/** The Sydney calendar date REMIND_DAYS_AHEAD days from today, as YYYY-MM-DD. */
function horizonDateStr(): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + REMIND_DAYS_AHEAD)).toISOString().slice(0, 10);
}

/** Placeholder addresses for call-in customers with no email — never mailed. */
function isEmailable(email: string | null | undefined): email is string {
  return !!email && !email.endsWith("trimsandbubbles.invalid");
}

const ACTIVE_STATUSES = ["CONFIRMED", "PENDING_PAYMENT", "IN_PROGRESS"] as const;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [settings, ownerEmail] = await Promise.all([getBusinessSettings(), getOwnerEmail()]);
  const address = settings.bookingAddress || null;

  const reminders = await runReminders(ownerEmail, address);
  const rebook = await runRebookNudges(settings.rebookWeeks, ownerEmail);

  return NextResponse.json({ ok: true, reminders, rebook });
}

// ── 1. Upcoming reminders ───────────────────────────────────────────────────
async function runReminders(ownerEmail: string, address: string | null) {
  const now = new Date();
  const horizon = horizonDateStr();
  const { end: windowEnd } = sydneyCalendarDayRange(horizon);

  const appts = await prisma.appointment.findMany({
    where: { startAt: { gte: now, lt: windowEnd }, status: { in: [...ACTIVE_STATUSES] }, reminderSentAt: null },
    include: { client: { include: { user: true } }, pet: true, primaryService: true, addOns: { include: { service: true } } },
    orderBy: { startAt: "asc" },
  });

  const groups = groupByBooking(appts);
  let reminded = 0;
  for (const group of groups) {
    const first = group[0];
    const to = first.client.user.email;
    let handled = true;
    if (isEmailable(to)) {
      handled = await sendReminder({
        to,
        customerName: first.client.user.name,
        startAt: first.startAt,
        dogs: group.map((g) => ({ petName: g.pet.name, services: [g.primaryService.name, ...g.addOns.map((x) => x.service.name)] })),
        address,
        replyTo: ownerEmail,
      });
    }
    if (handled) {
      await prisma.appointment.updateMany({ where: { id: { in: group.map((g) => g.id) } }, data: { reminderSentAt: new Date() } });
      if (isEmailable(to)) reminded += group.length;
    }
  }
  return { groups: groups.length, reminded };
}

// ── 2. Rebooking nudges ─────────────────────────────────────────────────────
async function runRebookNudges(rebookWeeks: number, ownerEmail: string) {
  if (!rebookWeeks || rebookWeeks <= 0) return { enabled: false, groups: 0, nudged: 0 };

  const now = Date.now();
  const upper = new Date(now - rebookWeeks * 7 * 24 * 60 * 60_000); // visit must be at least this old
  const lower = new Date(upper.getTime() - REBOOK_WINDOW_DAYS * 24 * 60 * 60_000); // but not older than this

  const candidates = await prisma.appointment.findMany({
    where: {
      startAt: { gte: lower, lt: upper },
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      rebookNudgeSentAt: null,
    },
    include: { client: { include: { user: true } }, pet: true },
    orderBy: { startAt: "asc" },
  });

  // Only nudge dogs that haven't already been booked in again since this visit.
  const due: typeof candidates = [];
  for (const appt of candidates) {
    const later = await prisma.appointment.count({
      where: { petId: appt.petId, startAt: { gt: appt.startAt }, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
    });
    if (later === 0) due.push(appt);
  }

  // One email per client, listing each of their due dogs.
  const byClient = new Map<string, typeof candidates>();
  for (const appt of due) {
    const arr = byClient.get(appt.clientId);
    if (arr) arr.push(appt);
    else byClient.set(appt.clientId, [appt]);
  }

  let nudged = 0;
  for (const group of byClient.values()) {
    const first = group[0];
    const to = first.client.user.email;
    let handled = true;
    if (isEmailable(to)) {
      handled = await sendRebookNudge({
        to,
        customerName: first.client.user.name,
        petNames: [...new Set(group.map((g) => g.pet.name))],
        weeks: rebookWeeks,
        replyTo: ownerEmail,
      });
    }
    if (handled) {
      await prisma.appointment.updateMany({ where: { id: { in: group.map((g) => g.id) } }, data: { rebookNudgeSentAt: new Date() } });
      if (isEmailable(to)) nudged += 1;
    }
  }
  return { enabled: true, groups: byClient.size, nudged };
}

// ── helpers ─────────────────────────────────────────────────────────────────
function groupByBooking<T extends { id: string; bookingGroupId: string | null }>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const key = r.bookingGroupId ?? r.id;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }
  return [...groups.values()];
}

/** Returns true only if the email actually sent (sendEmail is fail-soft). */
async function sendReminder(n: {
  to: string;
  customerName: string;
  startAt: Date;
  dogs: { petName: string; services: string[] }[];
  address: string | null;
  replyTo: string;
}): Promise<boolean> {
  const when = WHEN_FMT.format(n.startAt);
  const listHtml = `<ul style="margin:0 0 12px;padding-left:18px;">${n.dogs
    .map((d) => `<li style="margin:0 0 4px;"><strong>${escapeHtml(d.petName)}</strong> — ${escapeHtml(d.services.join(" + "))}</li>`)
    .join("")}</ul>`;
  const listText = n.dogs.map((d) => `${d.petName}: ${d.services.join(" + ")}`).join("; ");
  const addressHtml = n.address ? `<p style="margin:0 0 12px;">Drop-off address: <strong>${escapeHtml(n.address)}</strong></p>` : "";
  const addressText = n.address ? ` Drop-off address: ${n.address}.` : "";
  const body = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(n.customerName)},</p>
    <p style="margin:0 0 12px;">Just a friendly reminder — your Trims &amp; Bubbles appointment is coming up. 🐾</p>
    <p style="margin:0 0 6px;">When: <strong>${escapeHtml(when)}</strong></p>
    ${listHtml}
    ${addressHtml}
    <p style="margin:0 0 12px;">Payment is in person on the day (cash). If anything's changed, just reply to this email and we'll sort it out.</p>
    <p style="margin:0;">See you soon,<br/>The Trims &amp; Bubbles team</p>
  `;
  return sendEmail({
    to: n.to,
    subject: `Reminder: your appointment on ${when}`,
    html: emailLayout(body),
    text: `Hi ${n.customerName}, a friendly reminder your Trims & Bubbles appointment is coming up — ${when}. ${listText}.${addressText} Payment in person (cash). See you soon!`,
    replyTo: n.replyTo,
  });
}

async function sendRebookNudge(n: {
  to: string;
  customerName: string;
  petNames: string[];
  weeks: number;
  replyTo: string;
}): Promise<boolean> {
  const dogs =
    n.petNames.length === 1
      ? n.petNames[0]
      : `${n.petNames.slice(0, -1).join(", ")} and ${n.petNames[n.petNames.length - 1]}`;
  const body = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(n.customerName)},</p>
    <p style="margin:0 0 12px;">It's been about ${n.weeks} weeks since <strong>${escapeHtml(dogs)}</strong> last visited Trims &amp; Bubbles — they might be due for a freshen-up! 🐾</p>
    <p style="margin:0 0 16px;">
      <a href="${SITE_URL}/book" style="display:inline-block;background:#e05a47;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Book their next groom</a>
    </p>
    <p style="margin:0 0 12px;">Pick any time that suits — we'd love to see them again. Just reply to this email if you have any questions.</p>
    <p style="margin:0;">With love,<br/>The Trims &amp; Bubbles team</p>
  `;
  return sendEmail({
    to: n.to,
    subject: `Time for ${dogs}'s next groom?`,
    html: emailLayout(body),
    text: `Hi ${n.customerName}, it's been about ${n.weeks} weeks since ${dogs} last visited Trims & Bubbles — they may be due for a groom. Book anytime: ${SITE_URL}/book. We'd love to see them again!`,
    replyTo: n.replyTo,
  });
}
