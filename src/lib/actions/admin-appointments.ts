"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffOrOwner } from "@/lib/session";
import type { ActionResult } from "@/lib/actions/pets";
import { validateAndProcessImage, saveImage } from "@/lib/uploads";
import { isRequestedSlotBookable, totalDurationMinutes } from "@/lib/availability-data";
import { sendEmail, escapeHtml, emailLayout } from "@/lib/email";

/** A single appointment's Sydney date + time, e.g. "Tuesday, 15 July 2026 at 2:00 pm". */
const APPT_DATETIME_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** The friendly error we surface whenever a slot is snatched between pick and save. */
const SLOT_TAKEN_MESSAGE = "Sorry, that time was just taken — please pick another.";

/** Postgres exclusion-constraint (SQLSTATE 23P01) — the hard backstop against
 * double-booking, mirrored from the booking flow. */
function isOverlapConstraintViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("no_overlapping_appointments") ||
    message.includes("23P01") ||
    message.toLowerCase().includes("exclusion")
  );
}

/**
 * Turn an untrusted uploaded File into a safe, stored image URL.
 *
 * The client-supplied MIME type and filename are NOT trusted: the shared
 * pipeline sniffs real magic bytes, re-encodes through sharp (stripping EXIF
 * GPS + any script payload), and picks the stored extension itself. Returns
 * null if the bytes are not a genuine JPEG/PNG/WebP, so the caller can show a
 * friendly error instead of writing a hostile file to a same-origin URL. */
async function savePhotoFile(file: File): Promise<string | null> {
  try {
    const processed = await validateAndProcessImage(await file.arrayBuffer());
    return await saveImage(processed, "appointments");
  } catch {
    return null;
  }
}

function revalidateAppointment(appointmentId: string, clientUserPath?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/calendar");
  revalidatePath(`/admin/appointments/${appointmentId}`);
  revalidatePath("/portal");
  revalidatePath("/portal/appointments");
  revalidatePath(`/portal/appointments/${appointmentId}`);
  if (clientUserPath) revalidatePath(clientUserPath);
}

/**
 * The core daily admin action: add a photo and/or a note, and mark the job
 * complete — all in one submit. A FormData action (not a typed object) so it
 * can carry the actual photo File straight from a phone camera input.
 */
export async function completeAppointmentWithPhoto(formData: FormData): Promise<ActionResult> {
  await requireStaffOrOwner();

  const appointmentId = String(formData.get("appointmentId") || "");
  if (!appointmentId) return { status: "error", message: "Missing appointment." };

  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment) return { status: "error", message: "Appointment not found." };

  const note = String(formData.get("note") || "").trim();
  const photo = formData.get("photo");
  const caption = String(formData.get("caption") || "").trim();

  let photoUrl: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    photoUrl = await savePhotoFile(photo);
    if (!photoUrl) {
      return {
        status: "error",
        message: "That file doesn't look like a photo — please upload a JPG, PNG or WebP image.",
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    if (photoUrl) {
      await tx.appointmentPhoto.create({
        data: { appointmentId, url: photoUrl, caption: caption || null },
      });
    }
    await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        groomerNote: note || appointment.groomerNote,
        status: "COMPLETED",
      },
    });
  });

  revalidateAppointment(appointmentId);
  revalidatePath(`/portal/pets`);
  return { status: "success" };
}

const statusSchema = z.enum(["PENDING_PAYMENT", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"]);

export async function updateAppointmentStatus(appointmentId: string, status: string, cancelReason?: string): Promise<ActionResult> {
  await requireStaffOrOwner();
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { status: "error", message: "Not a valid status." };

  const cleanReason = cancelReason?.trim() || null;

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: parsed.data,
      cancelledAt: parsed.data === "CANCELLED" ? new Date() : null,
      cancelReason: parsed.data === "CANCELLED" ? cleanReason : null,
    },
    include: {
      pet: true,
      primaryService: true,
      client: { include: { user: true } },
    },
  });

  // Cancellation → tell the customer (best-effort; never blocks the update).
  if (parsed.data === "CANCELLED") {
    // A multi-dog booking is stored as several back-to-back rows sharing a
    // bookingGroupId. Cancelling one dog but silently leaving the others booked
    // would strand the customer with half a booking, so take the whole group —
    // this matches what the customer-side cancel already does.
    if (updated.bookingGroupId) {
      await prisma.appointment.updateMany({
        where: {
          bookingGroupId: updated.bookingGroupId,
          id: { not: updated.id },
          status: { in: ["PENDING_PAYMENT", "CONFIRMED", "IN_PROGRESS"] },
        },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: cleanReason },
      });
    }
    await sendCancellationEmail(updated);
  }

  revalidateAppointment(appointmentId);
  revalidatePath("/portal/appointments");
  return { status: "success" };
}

type AppointmentForEmail = {
  startAt: Date;
  cancelReason: string | null;
  pet: { name: string };
  primaryService: { name: string };
  client: { user: { name: string; email: string } };
};

/** Emails the customer that their appointment was cancelled, with the reason
 * (if given) and a nudge to rebook. Fire-and-forget: sendEmail is fail-soft. */
async function sendCancellationEmail(apt: AppointmentForEmail): Promise<void> {
  const to = apt.client.user.email;
  if (!to) return;

  const when = APPT_DATETIME_FMT.format(apt.startAt);
  const reasonHtml = apt.cancelReason
    ? `<p style="margin:0 0 12px;">Reason: ${escapeHtml(apt.cancelReason)}</p>`
    : "";

  const body = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(apt.client.user.name)},</p>
    <p style="margin:0 0 12px;">We're sorry, but your <strong>${escapeHtml(apt.primaryService.name)}</strong> appointment for ${escapeHtml(apt.pet.name)} on <strong>${escapeHtml(when)}</strong> has been cancelled.</p>
    ${reasonHtml}
    <p style="margin:0 0 12px;">We'd love to see ${escapeHtml(apt.pet.name)} another time — you can book a new spot whenever suits you.</p>
    <p style="margin:0;">With love,<br/>The Trims &amp; Bubbles team</p>
  `;

  await sendEmail({
    to,
    subject: `Your Trims & Bubbles appointment on ${when} was cancelled`,
    html: emailLayout(body),
    text: `Hi ${apt.client.user.name}, your ${apt.primaryService.name} appointment for ${apt.pet.name} on ${when} has been cancelled.${apt.cancelReason ? ` Reason: ${apt.cancelReason}.` : ""} You're welcome to book a new spot whenever suits you. — Trims & Bubbles`,
  });
}

/**
 * Move an existing appointment to a new start time, keeping its status and its
 * total reserved duration (primary service + add-ons) intact. The new slot is
 * re-validated against the SAME source of truth the booking wizard/api use,
 * EXCLUDING this appointment itself from the busy check (so it doesn't collide
 * with its own current time). The Postgres exclusion constraint remains the
 * hard backstop against a concurrent double-book. On success the customer is
 * emailed the new date/time (best-effort).
 */
export async function rescheduleAppointment(appointmentId: string, newStartISO: string): Promise<ActionResult> {
  await requireStaffOrOwner();

  if (!appointmentId) return { status: "error", message: "Missing appointment." };
  const start = new Date(newStartISO);
  if (Number.isNaN(start.getTime())) {
    return { status: "error", message: "That's not a valid time — please pick a slot." };
  }
  if (start.getTime() < Date.now()) {
    return { status: "error", message: "That time has already passed — please pick another." };
  }

  const apt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      pet: true,
      primaryService: true,
      client: { include: { user: true } },
      addOns: { include: { service: true } },
    },
  });
  if (!apt) return { status: "error", message: "Appointment not found." };
  if (apt.status === "CANCELLED" || apt.status === "NO_SHOW") {
    return { status: "error", message: "This appointment can no longer be changed." };
  }

  const durationMinutes = totalDurationMinutes(
    apt.primaryService.durationMinutes,
    apt.addOns.map((a) => a.service.durationMinutes),
  );
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const dateStr = start.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }); // YYYY-MM-DD

  // Authoritative re-validation — excluding this appointment from its own busy
  // check so its current time doesn't count as a conflict.
  const bookable = await isRequestedSlotBookable(dateStr, { startAt: start, endAt: end }, durationMinutes, appointmentId);
  if (!bookable) {
    return { status: "error", message: "That time isn't available anymore — please pick another slot." };
  }

  try {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { startAt: start, endAt: end },
    });
  } catch (error) {
    if (isOverlapConstraintViolation(error)) {
      return { status: "error", message: SLOT_TAKEN_MESSAGE };
    }
    throw error;
  }

  await sendRescheduleEmail({
    startAt: start,
    pet: apt.pet,
    primaryService: apt.primaryService,
    client: apt.client,
  });

  revalidateAppointment(appointmentId);
  return { status: "success" };
}

/** Emails the customer their appointment's new date/time. Best-effort. */
async function sendRescheduleEmail(apt: Omit<AppointmentForEmail, "cancelReason">): Promise<void> {
  const to = apt.client.user.email;
  if (!to) return;

  const when = APPT_DATETIME_FMT.format(apt.startAt);
  const body = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(apt.client.user.name)},</p>
    <p style="margin:0 0 12px;">Your <strong>${escapeHtml(apt.primaryService.name)}</strong> appointment for ${escapeHtml(apt.pet.name)} has a new time:</p>
    <p style="margin:0 0 12px;font-size:16px;"><strong>${escapeHtml(when)}</strong></p>
    <p style="margin:0 0 12px;">Nothing else has changed. If this new time doesn't work for you, just get in touch and we'll sort it out.</p>
    <p style="margin:0;">See you soon,<br/>The Trims &amp; Bubbles team</p>
  `;

  await sendEmail({
    to,
    subject: `Your Trims & Bubbles appointment has moved to ${when}`,
    html: emailLayout(body),
    text: `Hi ${apt.client.user.name}, your ${apt.primaryService.name} appointment for ${apt.pet.name} has been rescheduled to ${when}. If that doesn't work, please get in touch. — Trims & Bubbles`,
  });
}

const manualPaymentSchema = z.object({
  appointmentId: z.string().min(1),
  type: z.enum(["DEPOSIT", "BALANCE", "FULL"]),
  amountCents: z.number().int().positive(),
  method: z.enum(["CASH", "OTHER"]),
});

/** Records a payment the owner collected in person (cash, EFTPOS terminal,
 * bank transfer) — not everything goes through Stripe. */
export async function recordManualPayment(input: z.infer<typeof manualPaymentSchema>): Promise<ActionResult> {
  await requireStaffOrOwner();
  const parsed = manualPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the payment details." };
  }
  const d = parsed.data;

  await prisma.payment.create({
    data: {
      appointmentId: d.appointmentId,
      type: d.type,
      amountCents: d.amountCents,
      status: "PAID",
      method: d.method,
      paidAt: new Date(),
    },
  });

  // A deposit collected in person confirms an appointment the same way a
  // Stripe webhook eventually will.
  const appointment = await prisma.appointment.findUnique({ where: { id: d.appointmentId } });
  if (appointment?.status === "PENDING_PAYMENT" && d.type === "DEPOSIT") {
    await prisma.appointment.update({ where: { id: d.appointmentId }, data: { status: "CONFIRMED" } });
  }

  revalidateAppointment(d.appointmentId);
  revalidatePath("/admin/payments");
  revalidatePath("/portal/payments");
  return { status: "success" };
}
