"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getBusinessSettings } from "@/lib/services-data";
import { sendEmail, escapeHtml, emailLayout } from "@/lib/email";
import { businessConfig } from "@/config/business";
import type { ActionResult } from "@/lib/actions/pets";

/** Statuses a customer is allowed to cancel from the portal. Once a job is
 * in progress / done / already cancelled, they need to phone instead. */
const CANCELLABLE = new Set(["PENDING_PAYMENT", "CONFIRMED"]);

const WHEN_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function resolveOwnerEmail(settingsContactEmail: string | null | undefined): string {
  return settingsContactEmail || process.env.OWNER_NOTIFICATION_EMAIL || businessConfig.contact.email;
}

/**
 * Lets a logged-in client cancel their OWN upcoming booking. If the booking
 * has several dogs (a bookingGroup), the whole booking is cancelled together.
 * The owner is emailed immediately, and the customer gets a confirmation. The
 * appointment is resolved from the session's client id — never trusted from the
 * input — so a client can only ever cancel their own booking.
 */
export async function cancelMyAppointment(input: { appointmentId: string; reason?: string }): Promise<ActionResult> {
  const session = await requireSession();
  const client = await prisma.client.findUnique({ where: { userId: session.user.id } });
  if (!client) return { status: "error", message: "We couldn't find your account." };

  const apt = await prisma.appointment.findFirst({
    where: { id: input.appointmentId, clientId: client.id },
  });
  if (!apt) return { status: "error", message: "That appointment couldn't be found." };
  if (!CANCELLABLE.has(apt.status)) {
    return { status: "error", message: "This booking can no longer be cancelled online — please give us a call." };
  }
  if (apt.startAt.getTime() < Date.now()) {
    return { status: "error", message: "This appointment has already passed." };
  }

  const reason = input.reason?.trim().slice(0, 300) || "Cancelled by the customer";

  // Cancel the whole booking: every one of THIS client's dogs in the same
  // booking group (or just this one if it isn't grouped). Filter to the still-
  // active ones in JS to keep the query types simple.
  const siblings = await prisma.appointment.findMany({
    where: apt.bookingGroupId
      ? { bookingGroupId: apt.bookingGroupId, clientId: client.id }
      : { id: apt.id },
    include: { pet: true, primaryService: true },
    orderBy: { startAt: "asc" },
  });
  // Only sweep up siblings that are BOTH still cancellable and still in the
  // future. Without the time check, cancelling a later dog in a group would
  // silently cancel an earlier one that has already started — the groomer
  // might be mid-groom on it, and staff don't always advance the status to
  // IN_PROGRESS in time for that to be caught by status alone.
  const now = Date.now();
  const cancelled = siblings.filter(
    (a) => (a.status === "PENDING_PAYMENT" || a.status === "CONFIRMED") && a.startAt.getTime() > now,
  );
  if (cancelled.length === 0) {
    return { status: "error", message: "This booking can no longer be cancelled online — please give us a call." };
  }

  await prisma.appointment.updateMany({
    where: { id: { in: cancelled.map((a) => a.id) } },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
  });

  const settings = await getBusinessSettings();
  await notifyCancellation({
    ownerEmail: settings.contactEmail,
    customerName: session.user.name,
    customerEmail: session.user.email,
    reason: input.reason?.trim() || null,
    dogs: cancelled.map((a) => ({ petName: a.pet.name, serviceName: a.primaryService.name, startAt: a.startAt })),
  });

  revalidatePath("/portal/appointments");
  revalidatePath(`/portal/appointments/${apt.id}`);
  revalidatePath("/admin");
  revalidatePath("/admin/calendar");
  return { status: "success" };
}

type CancelNotification = {
  ownerEmail: string | null | undefined;
  customerName: string;
  customerEmail: string;
  reason: string | null;
  dogs: { petName: string; serviceName: string; startAt: Date }[];
};

/** Emails the OWNER that a customer cancelled, and confirms to the customer.
 * Fire-and-forget: sendEmail is fail-soft. */
async function notifyCancellation(n: CancelNotification): Promise<void> {
  const first = n.dogs[0];
  const when = first ? WHEN_FMT.format(first.startAt) : "";
  const dogCount = n.dogs.length;
  const dogWord = dogCount === 1 ? "dog" : "dogs";
  const listHtml = `<ul style="margin:0 0 12px;padding-left:18px;">${n.dogs
    .map((d) => `<li style="margin:0 0 4px;"><strong>${escapeHtml(d.petName)}</strong> — ${escapeHtml(d.serviceName)}</li>`)
    .join("")}</ul>`;
  const listText = n.dogs.map((d) => `${d.petName}: ${d.serviceName}`).join("; ");
  const reasonHtml = n.reason ? `<p style="margin:0 0 12px;"><strong>Reason:</strong> ${escapeHtml(n.reason)}</p>` : "";

  // Owner alert.
  const ownerBody = `
    <p style="margin:0 0 12px;">A customer has <strong>cancelled</strong> their booking.</p>
    <p style="margin:0 0 6px;"><strong>${dogCount} ${dogWord}</strong> · was booked for <strong>${escapeHtml(when)}</strong></p>
    ${listHtml}
    <p style="margin:0 0 6px;">Customer: ${escapeHtml(n.customerName)} (${escapeHtml(n.customerEmail)})</p>
    ${reasonHtml}
    <p style="margin:0;">That time is now free again on your calendar.</p>
  `;
  await sendEmail({
    to: resolveOwnerEmail(n.ownerEmail),
    subject: `Booking cancelled — ${dogCount} ${dogWord}, ${when}`,
    html: emailLayout(ownerBody),
    text: `A customer cancelled their booking (${dogCount} ${dogWord}) for ${when}. ${listText}. Customer: ${n.customerName} (${n.customerEmail}).${n.reason ? ` Reason: ${n.reason}.` : ""}`,
    replyTo: n.customerEmail,
  });

  // Customer confirmation.
  const customerBody = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(n.customerName)},</p>
    <p style="margin:0 0 12px;">Your booking for <strong>${escapeHtml(when)}</strong> has been cancelled — no worries at all.</p>
    ${listHtml}
    <p style="margin:0 0 12px;">We'd love to see you another time; book again whenever suits you.</p>
    <p style="margin:0;">— The Trims &amp; Bubbles team</p>
  `;
  await sendEmail({
    to: n.customerEmail,
    subject: `Your Trims & Bubbles booking on ${when} is cancelled`,
    html: emailLayout(customerBody),
    text: `Hi ${n.customerName}, your booking for ${when} has been cancelled. ${listText}. Book again whenever suits you. — Trims & Bubbles`,
  });
}
