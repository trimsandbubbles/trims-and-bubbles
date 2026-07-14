"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getBusinessSettings } from "@/lib/services-data";
import { checkSlotStillOpen, isRequestedSlotBookable, totalDurationMinutes } from "@/lib/availability-data";
import { getStripeClient, isStripeConfigured, siteUrl } from "@/lib/stripe";
import { sendEmail, escapeHtml, emailLayout } from "@/lib/email";
import { businessConfig } from "@/config/business";

const THIRTY_MINUTES_SECONDS = 30 * 60;

const bookingSchema = z
  .object({
    serviceId: z.string().min(1),
    addOnServiceIds: z.array(z.string()).default([]),
    startAt: z.iso.datetime(),
    petId: z.string().optional(),
    newPet: z
      .object({
        name: z.string().min(1, "Your dog needs a name").max(60),
        breed: z.string().max(80).optional(),
        sizeBand: z.enum(["SMALL", "MEDIUM", "LARGE"]),
        weightKg: z.number().positive().optional(),
        coatType: z.string().max(80).optional(),
        temperamentNotes: z.string().max(1000).optional(),
      })
      .optional(),
    phone: z.string().min(1, "A contact number is required"),
    notesFromClient: z.string().max(1000).optional(),
    pickupRequested: z.boolean().default(false),
    pickupAddress: z.string().max(300).optional(),
  })
  .refine((data) => data.petId || data.newPet, { message: "Choose a dog, or add a new one." });

export type BookingInput = z.infer<typeof bookingSchema>;

export type BookingResult =
  | { status: "success"; appointmentId: string; checkoutUrl?: string }
  | { status: "error"; message: string };

/**
 * Creates an appointment. Requires a logged-in session — the booking
 * wizard's final step handles inline sign-in/registration first, so by the
 * time this runs the visitor always has an account (every booking becomes a
 * client record, which is the point of the client portal).
 *
 * When a deposit is owed AND Stripe is configured, the appointment is
 * created as PENDING_PAYMENT and a Checkout Session URL is returned for the
 * wizard to redirect to — the Stripe webhook (not this action, and not the
 * success-page redirect) is the source of truth that flips it to CONFIRMED.
 * Otherwise (on-inspection pricing, a $0 deposit, or Stripe not configured
 * yet) it's confirmed immediately, same as before Stripe existed — so the
 * prototype keeps working end-to-end without requiring an external account.
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

  // Resolve the pet: either one the client already owns, or a brand new one.
  let pet;
  if (input.petId) {
    pet = await prisma.pet.findFirst({ where: { id: input.petId, clientId: client.id, archivedAt: null } });
    if (!pet) return { status: "error", message: "That dog wasn't found on your account." };
  } else if (input.newPet) {
    pet = await prisma.pet.create({
      data: {
        clientId: client.id,
        name: input.newPet.name,
        breed: input.newPet.breed || null,
        sizeBand: input.newPet.sizeBand,
        weightKg: input.newPet.weightKg,
        coatType: input.newPet.coatType || null,
        temperamentNotes: input.newPet.temperamentNotes || null,
      },
    });
  } else {
    return { status: "error", message: "Choose a dog, or add a new one." };
  }

  const service = await prisma.service.findUnique({ where: { id: input.serviceId }, include: { prices: true } });
  if (!service || !service.active) {
    return { status: "error", message: "That service is no longer available. Please pick another." };
  }
  const priceRow = service.prices.find((p) => p.sizeBand === pet.sizeBand) ?? service.prices.find((p) => p.sizeBand === null);
  if (!priceRow) {
    return { status: "error", message: "That service isn't available for your dog's size — please get in touch." };
  }

  // Only genuine add-on services may be attached, and never the primary
  // service itself — otherwise a crafted call could pass a CORE service (or the
  // primary's own id) as an "add-on" for a doubled price/duration.
  const addOns = input.addOnServiceIds.length
    ? await prisma.service.findMany({
        where: {
          id: { in: input.addOnServiceIds, not: input.serviceId },
          active: true,
          category: "ADD_ON",
        },
      })
    : [];

  const durationMinutes = totalDurationMinutes(
    service.durationMinutes,
    addOns.map((a) => a.durationMinutes),
  );
  const startAt = new Date(input.startAt);
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);

  if (startAt.getTime() < Date.now()) {
    return { status: "error", message: "That time has already passed — please pick another." };
  }

  const dateStr = startAt.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }); // en-CA => YYYY-MM-DD

  // Authoritatively re-validate the requested slot against the SAME source of
  // truth the wizard/api use — not just the overlap check below. Guards direct
  // server-action calls that bypass the slot picker (outside opening hours, a
  // CLOSED exception day, below lead time, off the grid, or a duration that
  // runs past closing). Must run before the write, regardless of the DB
  // exclusion constraint, which only protects against overlaps.
  const bookable = await isRequestedSlotBookable(dateStr, { startAt, endAt }, durationMinutes);
  if (!bookable) {
    return { status: "error", message: "That time isn't available anymore — please pick another slot." };
  }

  // Shrink the race window between "slot shown" and "slot booked". The
  // Postgres exclusion constraint below is the actual hard guarantee.
  const stillOpen = await checkSlotStillOpen(dateStr, { startAt, endAt });
  if (!stillOpen) {
    return { status: "error", message: "Sorry, that time was just taken — please pick another." };
  }

  const addOnPrices = addOns.length
    ? await prisma.servicePrice.findMany({ where: { serviceId: { in: addOns.map((a) => a.id) } } })
    : [];
  const priceForAddOn = (addOnId: string) =>
    addOnPrices.find((p) => p.serviceId === addOnId && p.sizeBand === pet.sizeBand) ??
    addOnPrices.find((p) => p.serviceId === addOnId && p.sizeBand === null);

  const addOnTotalCents = addOns.reduce((sum, a) => sum + (priceForAddOn(a.id)?.priceCents ?? 0), 0);
  const totalPriceCents = (priceRow.isOnInspection ? 0 : priceRow.priceCents) + addOnTotalCents;
  const settings = await getBusinessSettings();
  const rawDepositCents = priceRow.isOnInspection ? 0 : Math.round((totalPriceCents * settings.depositPercentage) / 100);
  // Store null (not 0) when nothing is owed upfront — on-inspection pricing OR a
  // 0% deposit (the owner has deposits turned off) — so client-facing pages
  // never render a "$0 deposit" row.
  const depositPriceCents = rawDepositCents > 0 ? rawDepositCents : null;
  const requiresDeposit = !priceRow.isOnInspection && depositPriceCents !== null;

  // Fail closed in production: if a deposit is owed but online payment isn't
  // configured (e.g. a missing/typo'd STRIPE_SECRET_KEY), do NOT silently
  // auto-confirm an unpaid booking. Outside production we keep the convenient
  // auto-confirm so the prototype works end-to-end without a Stripe account.
  if (process.env.NODE_ENV === "production" && requiresDeposit && !isStripeConfigured()) {
    return { status: "error", message: "Online payment isn't available right now — please get in touch to book." };
  }

  const collectDepositViaStripe = requiresDeposit && isStripeConfigured();

  let appointment;
  try {
    appointment = await prisma.appointment.create({
      data: {
        clientId: client.id,
        petId: pet.id,
        primaryServiceId: service.id,
        startAt,
        endAt,
        status: collectDepositViaStripe ? "PENDING_PAYMENT" : "CONFIRMED",
        sizeBandAtBooking: pet.sizeBand,
        totalPriceCents,
        depositPriceCents,
        notesFromClient: input.notesFromClient || null,
        pickupRequested: input.pickupRequested,
        pickupAddress: input.pickupRequested ? input.pickupAddress || null : null,
        addOns: {
          create: addOns.map((a) => ({
            serviceId: a.id,
            priceCentsAtBooking: priceForAddOn(a.id)?.priceCents ?? 0,
          })),
        },
      },
    });
  } catch (error) {
    if (isOverlapConstraintViolation(error)) {
      return { status: "error", message: "Sorry, that time was just taken — please pick another." };
    }
    throw error;
  }

  revalidatePath("/portal/appointments");
  revalidatePath("/admin/calendar");

  if (!collectDepositViaStripe) {
    // Confirmed straight away → let the owner know a booking came in, and send
    // the customer a friendly confirmation. Both are best-effort (fail-soft).
    await notifyNewBooking({
      ownerEmail: settings.contactEmail,
      customerName: session.user.name,
      customerEmail: session.user.email,
      petName: pet.name,
      serviceName: service.name,
      addOnNames: addOns.map((a) => a.name),
      startAt,
      clientNote: input.notesFromClient || null,
    });
    return { status: "success", appointmentId: appointment.id };
  }

  // The appointment row already reserved the slot (DB exclusion constraint).
  // If Stripe itself fails here, don't strand the client with an
  // unpayable PENDING_PAYMENT booking — release the slot and surface an error.
  try {
    const stripe = getStripeClient();
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "aud",
            unit_amount: depositPriceCents!,
            product_data: { name: `Deposit — ${service.name} for ${pet.name}` },
          },
          quantity: 1,
        },
      ],
      success_url: `${siteUrl()}/portal/appointments/${appointment.id}?paid=1`,
      cancel_url: `${siteUrl()}/book?cancelled=1`,
      expires_at: Math.floor(Date.now() / 1000) + THIRTY_MINUTES_SECONDS,
      metadata: { appointmentId: appointment.id, paymentType: "DEPOSIT" },
    });

    if (!checkoutSession.url) throw new Error("Stripe returned no checkout URL");

    await prisma.payment.create({
      data: {
        appointmentId: appointment.id,
        type: "DEPOSIT",
        amountCents: depositPriceCents!,
        status: "PENDING",
        method: "STRIPE",
        stripeCheckoutSessionId: checkoutSession.id,
      },
    });

    return { status: "success", appointmentId: appointment.id, checkoutUrl: checkoutSession.url };
  } catch {
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Checkout failed to start" },
    });
    revalidatePath("/admin/calendar");
    return { status: "error", message: "Couldn't start checkout — please try again." };
  }
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

type NewBookingNotification = {
  ownerEmail: string | null | undefined;
  customerName: string;
  customerEmail: string;
  petName: string;
  serviceName: string;
  addOnNames: string[];
  startAt: Date;
  clientNote: string | null;
};

/** Fire-and-forget: emails the OWNER a new-booking alert and the CUSTOMER a
 * warm confirmation. sendEmail is fail-soft, so a slow/failed send never
 * breaks the booking. */
async function notifyNewBooking(n: NewBookingNotification): Promise<void> {
  const when = BOOKING_DATETIME_FMT.format(n.startAt);
  const addOnsLine = n.addOnNames.length ? ` + ${n.addOnNames.map(escapeHtml).join(", ")}` : "";
  const noteHtml = n.clientNote
    ? `<p style="margin:0 0 12px;"><strong>Their note:</strong> ${escapeHtml(n.clientNote)}</p>`
    : "";

  // Owner alert.
  const ownerBody = `
    <p style="margin:0 0 12px;">You've got a new booking. 🎉</p>
    <p style="margin:0 0 6px;"><strong>${escapeHtml(n.serviceName)}</strong>${addOnsLine}</p>
    <p style="margin:0 0 6px;">Dog: ${escapeHtml(n.petName)}</p>
    <p style="margin:0 0 6px;">Customer: ${escapeHtml(n.customerName)} (${escapeHtml(n.customerEmail)})</p>
    <p style="margin:0 0 12px;">When: <strong>${escapeHtml(when)}</strong></p>
    ${noteHtml}
  `;
  await sendEmail({
    to: resolveOwnerEmail(n.ownerEmail),
    subject: `New booking — ${n.petName}, ${when}`,
    html: emailLayout(ownerBody),
    text: `New booking: ${n.serviceName}${n.addOnNames.length ? ` + ${n.addOnNames.join(", ")}` : ""} for ${n.petName} on ${when}. Customer: ${n.customerName} (${n.customerEmail}).${n.clientNote ? ` Note: ${n.clientNote}` : ""}`,
    replyTo: n.customerEmail,
  });

  // Customer confirmation.
  const customerBody = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(n.customerName)},</p>
    <p style="margin:0 0 12px;">Thanks for booking with Trims &amp; Bubbles! We can't wait to pamper ${escapeHtml(n.petName)}. 🐾</p>
    <p style="margin:0 0 6px;"><strong>${escapeHtml(n.serviceName)}</strong>${addOnsLine}</p>
    <p style="margin:0 0 12px;">When: <strong>${escapeHtml(when)}</strong></p>
    <p style="margin:0;">See you soon,<br/>The Trims &amp; Bubbles team</p>
  `;
  await sendEmail({
    to: n.customerEmail,
    subject: `You're booked in — ${n.petName} on ${when}`,
    html: emailLayout(customerBody),
    text: `Hi ${n.customerName}, thanks for booking with Trims & Bubbles! ${n.serviceName}${n.addOnNames.length ? ` + ${n.addOnNames.join(", ")}` : ""} for ${n.petName} on ${when}. See you soon!`,
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
