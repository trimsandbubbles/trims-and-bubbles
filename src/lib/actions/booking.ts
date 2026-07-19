"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getBusinessSettings } from "@/lib/services-data";
import { checkSlotStillOpen, isRequestedSlotBookable, totalDurationMinutes } from "@/lib/availability-data";
import { sendEmail, escapeHtml, emailLayout } from "@/lib/email";
import { businessConfig } from "@/config/business";

/** One groomer can't realistically do more than this in a single visit; more
 * than that, ask them to call so it can be spread across days. */
const MAX_DOGS_PER_BOOKING = 6;

const sizeEnum = z.enum(["SMALL", "MEDIUM", "LARGE"]);

/** One dog in a booking: either an existing saved pet, OR a quick-added dog
 * (just a size — name/breed/coat optional), PLUS the service (and any add-ons)
 * chosen for that dog. */
const dogLineSchema = z
  .object({
    petId: z.string().optional(),
    newDog: z
      .object({
        name: z.string().max(60).optional(),
        breed: z.string().max(80).optional(),
        sizeBand: sizeEnum,
        coatType: z.string().max(80).optional(),
      })
      .optional(),
    serviceId: z.string().min(1),
    addOnServiceIds: z.array(z.string()).default([]),
  })
  .refine((d) => d.petId || d.newDog, { message: "Each dog needs to be chosen or added." });

const bookingSchema = z.object({
  startAt: z.iso.datetime(),
  phone: z.string().min(1, "A contact number is required"),
  notesFromClient: z.string().max(1000).optional(),
  pickupRequested: z.boolean().default(false),
  pickupAddress: z.string().max(300).optional(),
  dogs: z
    .array(dogLineSchema)
    .min(1, "Please add at least one dog.")
    .max(MAX_DOGS_PER_BOOKING, `Please call us to book more than ${MAX_DOGS_PER_BOOKING} dogs at once.`),
});

export type BookingInput = z.infer<typeof bookingSchema>;

export type BookingResult =
  | { status: "success"; bookingGroupId: string; appointmentIds: string[]; primaryAppointmentId: string }
  | { status: "error"; message: string };

const SIZE_LABEL: Record<"SMALL" | "MEDIUM" | "LARGE", string> = {
  SMALL: "Small dog",
  MEDIUM: "Medium dog",
  LARGE: "Large dog",
};

type ResolvedLine = {
  existingPetId: string | null;
  newDog: { name: string; breed: string | null; sizeBand: "SMALL" | "MEDIUM" | "LARGE"; coatType: string | null } | null;
  petName: string;
  sizeBand: "SMALL" | "MEDIUM" | "LARGE";
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  priceCents: number;
  addOns: { id: string; name: string; priceCents: number }[];
};

/**
 * Creates a booking for ONE OR MORE dogs. Requires a logged-in session (the
 * wizard signs the visitor in first). Each dog can be an existing pet or a
 * quick-added dog (size only — no full profile needed); each dog gets its own
 * service + add-ons.
 *
 * Because there's a single groomer, the dogs are scheduled BACK-TO-BACK: the
 * customer picks one start time long enough to fit the whole job (validated
 * against the same availability source the picker uses), and we create N
 * sibling appointments — one per dog — at consecutive, non-overlapping times,
 * all sharing a bookingGroupId. The Postgres no-overlap exclusion constraint
 * still guards every row, and the whole set is created in one transaction so a
 * race can never leave a half-booked group.
 *
 * Cash-only: appointments are CONFIRMED immediately and paid in person (no
 * online payment / deposit for now).
 */
export async function createBooking(rawInput: BookingInput): Promise<BookingResult> {
  const parsed = bookingSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check your details." };
  }
  const input = parsed.data;

  const session = await requireSession();
  const client = await prisma.client.upsert({
    where: { userId: session.user.id },
    update: { phone: input.phone },
    create: { userId: session.user.id, phone: input.phone },
  });

  // ---- Resolve each dog line (pet + service + add-ons + duration + price). ----
  // Quick-added pets are NOT created here — that happens inside the booking
  // transaction, so a failed booking never leaves orphan dogs on the account.
  const resolved: ResolvedLine[] = [];
  for (const line of input.dogs) {
    let sizeBand: "SMALL" | "MEDIUM" | "LARGE";
    let existingPetId: string | null = null;
    let newDog: ResolvedLine["newDog"] = null;
    let petName: string;

    if (line.petId) {
      const pet = await prisma.pet.findFirst({
        where: { id: line.petId, clientId: client.id, archivedAt: null },
      });
      if (!pet) return { status: "error", message: "One of the dogs wasn't found on your account." };
      // Legacy XL sizes price as LARGE (XL was retired from the offering).
      sizeBand = pet.sizeBand === "SMALL" || pet.sizeBand === "MEDIUM" || pet.sizeBand === "LARGE" ? pet.sizeBand : "LARGE";
      existingPetId = pet.id;
      petName = pet.name;
    } else if (line.newDog) {
      sizeBand = line.newDog.sizeBand;
      petName = line.newDog.name?.trim() || SIZE_LABEL[sizeBand];
      newDog = {
        name: petName,
        breed: line.newDog.breed?.trim() || null,
        sizeBand,
        coatType: line.newDog.coatType?.trim() || null,
      };
    } else {
      return { status: "error", message: "Each dog needs to be chosen or added." };
    }

    const service = await prisma.service.findUnique({
      where: { id: line.serviceId },
      include: { prices: true },
    });
    if (!service || !service.active) {
      return { status: "error", message: "One of the chosen services is no longer available. Please review your dogs." };
    }
    const priceRow =
      service.prices.find((p) => p.sizeBand === sizeBand) ?? service.prices.find((p) => p.sizeBand === null);
    if (!priceRow) {
      return { status: "error", message: `${service.name} isn't available for a ${sizeBand.toLowerCase()} dog — please get in touch.` };
    }

    // Only genuine add-on services may attach, and never the primary service
    // itself — otherwise a crafted call could double a price/duration.
    const addOnServices = line.addOnServiceIds.length
      ? await prisma.service.findMany({
          where: { id: { in: line.addOnServiceIds, not: line.serviceId }, active: true, category: "ADD_ON" },
          include: { prices: true },
        })
      : [];
    const addOns = addOnServices.map((a) => {
      const ap = a.prices.find((p) => p.sizeBand === sizeBand) ?? a.prices.find((p) => p.sizeBand === null);
      return {
        id: a.id,
        name: a.name,
        priceCents: ap && !ap.isOnInspection ? ap.priceCents : 0,
        durationMinutes: a.durationMinutes,
      };
    });

    const durationMinutes = totalDurationMinutes(
      service.durationMinutes,
      addOns.map((a) => a.durationMinutes),
    );
    const priceCents =
      (priceRow.isOnInspection ? 0 : priceRow.priceCents) + addOns.reduce((s, a) => s + a.priceCents, 0);

    resolved.push({
      existingPetId,
      newDog,
      petName,
      sizeBand,
      serviceId: service.id,
      serviceName: service.name,
      durationMinutes,
      priceCents,
      addOns: addOns.map((a) => ({ id: a.id, name: a.name, priceCents: a.priceCents })),
    });
  }

  const totalDuration = resolved.reduce((s, r) => s + r.durationMinutes, 0);
  const startAt = new Date(input.startAt);
  if (startAt.getTime() < Date.now()) {
    return { status: "error", message: "That time has already passed — please pick another." };
  }
  const blockEnd = new Date(startAt.getTime() + totalDuration * 60_000);
  const dateStr = startAt.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }); // YYYY-MM-DD

  // Authoritatively re-validate the WHOLE block (opening hours, mid-day breaks,
  // lead time, the offered grid, and that it finishes before closing) against
  // the same source the picker uses — guards direct calls that skip the picker.
  const bookable = await isRequestedSlotBookable(dateStr, { startAt, endAt: blockEnd }, totalDuration);
  if (!bookable) {
    return { status: "error", message: "That time isn't available anymore — please pick another slot." };
  }
  const stillOpen = await checkSlotStillOpen(dateStr, { startAt, endAt: blockEnd });
  if (!stillOpen) {
    return { status: "error", message: "Sorry, that time was just taken — please pick another." };
  }

  const bookingGroupId = randomUUID();

  // All appointments in ONE transaction — all-or-nothing, so if someone grabs a
  // slice mid-way (23P01 from the exclusion constraint) the whole group rolls
  // back rather than leaving a partial booking.
  let appointmentIds: string[];
  try {
    appointmentIds = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      let cursor = startAt;
      for (let i = 0; i < resolved.length; i++) {
        const r = resolved[i];

        let petId = r.existingPetId;
        if (!petId && r.newDog) {
          const pet = await tx.pet.create({
            data: {
              clientId: client.id,
              name: r.newDog.name,
              breed: r.newDog.breed,
              sizeBand: r.newDog.sizeBand,
              coatType: r.newDog.coatType,
            },
          });
          petId = pet.id;
        }
        if (!petId) throw new Error("dog line resolved to no pet");

        const apptEnd = new Date(cursor.getTime() + r.durationMinutes * 60_000);
        const appt = await tx.appointment.create({
          data: {
            clientId: client.id,
            petId,
            primaryServiceId: r.serviceId,
            startAt: cursor,
            endAt: apptEnd,
            status: "CONFIRMED",
            sizeBandAtBooking: r.sizeBand,
            totalPriceCents: r.priceCents,
            depositPriceCents: null,
            // Booking-level note lives on the first appointment only.
            notesFromClient: i === 0 ? input.notesFromClient || null : null,
            pickupRequested: input.pickupRequested,
            pickupAddress: input.pickupRequested ? input.pickupAddress || null : null,
            bookingGroupId,
            addOns: { create: r.addOns.map((a) => ({ serviceId: a.id, priceCentsAtBooking: a.priceCents })) },
          },
        });
        ids.push(appt.id);
        cursor = apptEnd;
      }
      return ids;
    });
  } catch (error) {
    if (isOverlapConstraintViolation(error)) {
      return { status: "error", message: "Sorry, that time was just taken — please pick another." };
    }
    throw error;
  }

  revalidatePath("/portal/appointments");
  revalidatePath("/admin/calendar");

  const settings = await getBusinessSettings();
  await notifyNewBooking({
    ownerEmail: settings.contactEmail,
    customerName: session.user.name,
    customerEmail: session.user.email,
    startAt,
    clientNote: input.notesFromClient || null,
    dogs: resolved.map((r) => ({ petName: r.petName, serviceName: r.serviceName, addOnNames: r.addOns.map((a) => a.name) })),
  });

  return {
    status: "success",
    bookingGroupId,
    appointmentIds,
    primaryAppointmentId: appointmentIds[0],
  };
}

const BOOKING_DATETIME_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Owner address resolution order:
 *   BusinessSettings.contactEmail  (owner-editable, DB singleton)
 *     ?? OWNER_NOTIFICATION_EMAIL   (env override)
 *     ?? businessConfig.contact.email (code default of last resort).
 */
function resolveOwnerEmail(settingsContactEmail: string | null | undefined): string {
  return settingsContactEmail || process.env.OWNER_NOTIFICATION_EMAIL || businessConfig.contact.email;
}

type BookingDogLine = { petName: string; serviceName: string; addOnNames: string[] };

type NewBookingNotification = {
  ownerEmail: string | null | undefined;
  customerName: string;
  customerEmail: string;
  startAt: Date;
  clientNote: string | null;
  dogs: BookingDogLine[];
};

function dogLineText(d: BookingDogLine): string {
  const addOns = d.addOnNames.length ? ` + ${d.addOnNames.join(", ")}` : "";
  return `${d.petName}: ${d.serviceName}${addOns}`;
}

function dogLineHtml(d: BookingDogLine): string {
  const addOns = d.addOnNames.length ? ` + ${d.addOnNames.map(escapeHtml).join(", ")}` : "";
  return `<li style="margin:0 0 4px;"><strong>${escapeHtml(d.petName)}</strong> — ${escapeHtml(d.serviceName)}${addOns}</li>`;
}

/** Fire-and-forget: emails the OWNER a new-booking alert and the CUSTOMER a
 * warm confirmation, one email each summarising ALL the dogs. sendEmail is
 * fail-soft, so a slow/failed send never breaks the booking. */
async function notifyNewBooking(n: NewBookingNotification): Promise<void> {
  const when = BOOKING_DATETIME_FMT.format(n.startAt);
  const dogCount = n.dogs.length;
  const dogWord = dogCount === 1 ? "dog" : "dogs";
  const listHtml = `<ul style="margin:0 0 12px;padding-left:18px;">${n.dogs.map(dogLineHtml).join("")}</ul>`;
  const listText = n.dogs.map(dogLineText).join("; ");
  const noteHtml = n.clientNote
    ? `<p style="margin:0 0 12px;"><strong>Their note:</strong> ${escapeHtml(n.clientNote)}</p>`
    : "";

  const ownerBody = `
    <p style="margin:0 0 12px;">You've got a new booking. 🎉</p>
    <p style="margin:0 0 6px;"><strong>${dogCount} ${dogWord}</strong> · <strong>${escapeHtml(when)}</strong></p>
    ${listHtml}
    <p style="margin:0 0 6px;">Customer: ${escapeHtml(n.customerName)} (${escapeHtml(n.customerEmail)})</p>
    ${noteHtml}
  `;
  await sendEmail({
    to: resolveOwnerEmail(n.ownerEmail),
    subject: `New booking — ${dogCount} ${dogWord}, ${when}`,
    html: emailLayout(ownerBody),
    text: `New booking (${dogCount} ${dogWord}) on ${when}. ${listText}. Customer: ${n.customerName} (${n.customerEmail}).${n.clientNote ? ` Note: ${n.clientNote}` : ""}`,
    replyTo: n.customerEmail,
  });

  const customerBody = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(n.customerName)},</p>
    <p style="margin:0 0 12px;">Thanks for booking with Trims &amp; Bubbles! 🐾</p>
    <p style="margin:0 0 6px;">When: <strong>${escapeHtml(when)}</strong></p>
    ${listHtml}
    <p style="margin:0 0 12px;">Payment is in person on the day (cash). See you soon!</p>
    <p style="margin:0;">— The Trims &amp; Bubbles team</p>
  `;
  await sendEmail({
    to: n.customerEmail,
    subject: `You're booked in — ${when}`,
    html: emailLayout(customerBody),
    text: `Hi ${n.customerName}, thanks for booking with Trims & Bubbles! ${when}. ${listText}. Payment in person (cash). See you soon!`,
  });
}

/** Postgres's exclusion-constraint violation (SQLSTATE 23P01) is our final
 * structural safety net against double-booking — checked defensively by both
 * error code and constraint name, since Prisma doesn't have a dedicated
 * "known error code" for EXCLUDE constraints the way it does for UNIQUE. */
function isOverlapConstraintViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("no_overlapping_appointments") ||
    message.includes("23P01") ||
    message.toLowerCase().includes("exclusion")
  );
}
