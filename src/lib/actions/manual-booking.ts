"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffOrOwner } from "@/lib/session";
import { checkSlotStillOpen } from "@/lib/availability-data";
import { getBusinessSettings } from "@/lib/services-data";
import { sendEmail, escapeHtml, emailLayout } from "@/lib/email";

/**
 * Owner/staff-created booking for a customer who called or emailed. Unlike the
 * public wizard (which books for the logged-in visitor), this books on behalf
 * of ANY customer — an existing client, or a brand-new call-in for whom we
 * create a lightweight account so the appointment has somewhere to live.
 *
 * Trusted action (owner/staff only), so it's deliberately more flexible than
 * the public flow: the time isn't forced onto the offered slot grid or the
 * client lead-time — the owner can slot someone in wherever there's room. The
 * only hard rule is "don't overlap another booking", enforced here by the same
 * soft check the wizard uses AND, ultimately, by the Postgres exclusion
 * constraint that makes a true double-book structurally impossible.
 */

const SIZE_LABEL: Record<"SMALL" | "MEDIUM" | "LARGE", string> = {
  SMALL: "Small dog",
  MEDIUM: "Medium dog",
  LARGE: "Large dog",
};

/** Placeholder email domain for call-in customers with no email — a valid,
 * unique, non-routable address so the User row is well-formed. Never emailed. */
const NO_EMAIL_DOMAIN = "no-email.trimsandbubbles.invalid";
function isRealEmail(email: string | null | undefined): email is string {
  return !!email && !email.endsWith(NO_EMAIL_DOMAIN);
}

/** Legacy XL pets price as LARGE (XL was retired from the offering). */
function normalizeSize(size: string): "SMALL" | "MEDIUM" | "LARGE" {
  return size === "SMALL" || size === "MEDIUM" || size === "LARGE" ? size : "LARGE";
}

const customerSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), clientId: z.string().min(1) }),
  z.object({
    mode: z.literal("new"),
    name: z.string().trim().min(1, "Please enter the customer's name").max(80),
    phone: z.string().trim().min(1, "Please enter a contact number").max(40),
    email: z.string().trim().email("Enter a valid email").optional().or(z.literal("")),
  }),
]);

const dogSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("existing"), petId: z.string().min(1) }),
  z.object({
    mode: z.literal("new"),
    name: z.string().trim().max(60).optional(),
    breed: z.string().trim().max(80).optional(),
    sizeBand: z.enum(["SMALL", "MEDIUM", "LARGE"]),
  }),
]);

const schema = z.object({
  customer: customerSchema,
  dog: dogSchema,
  serviceIds: z.array(z.string().min(1)).min(1, "Please pick at least one service.").max(10),
  startAt: z.iso.datetime(),
  note: z.string().max(1000).optional(),
});

export type ManualBookingInput = z.infer<typeof schema>;

export type ManualBookingResult =
  | { status: "success"; appointmentId: string }
  | { status: "error"; message: string };

export async function createManualBooking(rawInput: ManualBookingInput): Promise<ManualBookingResult> {
  await requireStaffOrOwner();

  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the details." };
  }
  const input = parsed.data;

  // A brand-new customer has no saved dogs, so the dog must be entered fresh.
  if (input.customer.mode === "new" && input.dog.mode === "existing") {
    return { status: "error", message: "Please enter the dog's details for a new customer." };
  }

  // ---- Resolve (or create) the customer's client record ---------------------
  let clientId: string;
  let customerName: string;
  let customerEmail: string | null; // null = don't email (no real address)

  if (input.customer.mode === "existing") {
    const client = await prisma.client.findUnique({
      where: { id: input.customer.clientId },
      include: { user: true },
    });
    if (!client) return { status: "error", message: "That customer no longer exists." };
    clientId = client.id;
    customerName = client.user.name;
    customerEmail = isRealEmail(client.user.email) ? client.user.email : null;
  } else {
    const { name, phone } = input.customer;
    const email = input.customer.email?.trim() || "";
    // If a user with this email already exists, book against their existing
    // client rather than failing on the unique-email constraint.
    const existingUser = email ? await prisma.user.findUnique({ where: { email } }) : null;
    if (existingUser) {
      const client = await prisma.client.upsert({
        where: { userId: existingUser.id },
        update: { phone },
        create: { userId: existingUser.id, phone },
      });
      clientId = client.id;
      customerName = existingUser.name;
      customerEmail = isRealEmail(existingUser.email) ? existingUser.email : null;
    } else {
      // Lightweight account: a User (no password yet — they can register later
      // with this email for portal access) + a Client to own the booking.
      const userId = randomUUID();
      const finalEmail = email || `walkin-${userId}@${NO_EMAIL_DOMAIN}`;
      await prisma.user.create({
        data: { id: userId, name, email: finalEmail, emailVerified: false, role: "client" },
      });
      const client = await prisma.client.create({ data: { userId, phone } });
      clientId = client.id;
      customerName = name;
      customerEmail = email || null;
    }
  }

  // ---- Resolve the dog + its size ------------------------------------------
  let sizeBand: "SMALL" | "MEDIUM" | "LARGE";
  let existingPetId: string | null = null;
  let newPet: { name: string; breed: string | null; sizeBand: "SMALL" | "MEDIUM" | "LARGE" } | null = null;
  let petName: string;

  if (input.dog.mode === "existing") {
    const pet = await prisma.pet.findFirst({
      where: { id: input.dog.petId, clientId, archivedAt: null },
    });
    if (!pet) return { status: "error", message: "That dog wasn't found on this customer's account." };
    sizeBand = normalizeSize(pet.sizeBand);
    existingPetId = pet.id;
    petName = pet.name;
  } else {
    sizeBand = input.dog.sizeBand;
    petName = input.dog.name?.trim() || SIZE_LABEL[sizeBand];
    newPet = { name: petName, breed: input.dog.breed?.trim() || null, sizeBand };
  }

  // ---- Resolve the chosen services (one or more), price + duration ----------
  const uniqueServiceIds = [...new Set(input.serviceIds)];
  const coreServices = await prisma.service.findMany({
    where: { id: { in: uniqueServiceIds }, active: true },
    include: { prices: true },
  });
  if (coreServices.length !== uniqueServiceIds.length) {
    return { status: "error", message: "One of the chosen services is no longer available." };
  }
  const pricedCores = coreServices.map((s) => ({
    service: s,
    row: s.prices.find((p) => p.sizeBand === sizeBand) ?? s.prices.find((p) => p.sizeBand === null),
  }));
  const unpriced = pricedCores.find((c) => !c.row);
  if (unpriced) {
    return {
      status: "error",
      message: `${unpriced.service.name} isn't available for a ${sizeBand.toLowerCase()} dog.`,
    };
  }
  const primaryId = input.serviceIds[0];
  const primary = pricedCores.find((c) => c.service.id === primaryId) ?? pricedCores[0];
  const extraCores = pricedCores.filter((c) => c.service.id !== primary.service.id);

  // One drop-off slot: the visit is as long as its LONGEST service, not the sum.
  const durationMinutes = Math.max(...coreServices.map((s) => s.durationMinutes));
  const priceCents =
    (primary.row!.isOnInspection ? 0 : primary.row!.priceCents) +
    extraCores.reduce((s, c) => s + (c.row!.isOnInspection ? 0 : c.row!.priceCents), 0);
  const addOnRows = extraCores.map((c) => ({
    serviceId: c.service.id,
    priceCentsAtBooking: c.row!.isOnInspection ? 0 : c.row!.priceCents,
  }));

  // ---- Validate the time (future + no overlap). Owner-trusted, so no grid or
  // lead-time constraint — only the hard "don't collide" rule. --------------
  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.getTime())) return { status: "error", message: "That's not a valid time." };
  if (startAt.getTime() < Date.now()) {
    return { status: "error", message: "That time has already passed — please pick another." };
  }
  const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
  const dateStr = startAt.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }); // YYYY-MM-DD
  const stillOpen = await checkSlotStillOpen(dateStr, { startAt, endAt });
  if (!stillOpen) {
    return { status: "error", message: "That time overlaps another booking — please pick another." };
  }

  const bookingGroupId = randomUUID();
  let appointmentId: string;
  try {
    appointmentId = await prisma.$transaction(async (tx) => {
      let petId = existingPetId;
      if (!petId && newPet) {
        const pet = await tx.pet.create({
          data: { clientId, name: newPet.name, breed: newPet.breed, sizeBand: newPet.sizeBand },
        });
        petId = pet.id;
      }
      if (!petId) throw new Error("no pet resolved for manual booking");

      const appt = await tx.appointment.create({
        data: {
          clientId,
          petId,
          primaryServiceId: primary.service.id,
          startAt,
          endAt,
          status: "CONFIRMED",
          sizeBandAtBooking: sizeBand,
          totalPriceCents: priceCents,
          depositPriceCents: null,
          notesFromClient: input.note?.trim() || null,
          bookingGroupId,
          addOns: { create: addOnRows },
        },
      });
      return appt.id;
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("no_overlapping_appointments") || message.includes("23P01") || message.toLowerCase().includes("exclusion")) {
      return { status: "error", message: "That time was just taken — please pick another." };
    }
    throw error;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/clients");
  revalidatePath("/portal/appointments");

  // Confirmation email — best-effort, only when we have a real address.
  if (isRealEmail(customerEmail)) {
    const serviceNames = [primary.service.name, ...extraCores.map((c) => c.service.name)];
    const settings = await getBusinessSettings();
    await sendManualBookingEmail({
      to: customerEmail,
      customerName,
      petName,
      serviceNames,
      startAt,
      bookingAddress: settings.bookingAddress || null,
    });
  }

  return { status: "success", appointmentId };
}

const WHEN_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

async function sendManualBookingEmail(n: {
  to: string;
  customerName: string;
  petName: string;
  serviceNames: string[];
  startAt: Date;
  bookingAddress: string | null;
}): Promise<void> {
  const when = WHEN_FMT.format(n.startAt);
  const services = n.serviceNames.join(" + ");
  const addressHtml = n.bookingAddress
    ? `<p style="margin:0 0 12px;">Drop-off address: <strong>${escapeHtml(n.bookingAddress)}</strong></p>`
    : "";
  const addressText = n.bookingAddress ? ` Drop-off address: ${n.bookingAddress}.` : "";
  const body = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(n.customerName)},</p>
    <p style="margin:0 0 12px;">Your booking with Trims &amp; Bubbles is confirmed. 🐾</p>
    <p style="margin:0 0 6px;">When: <strong>${escapeHtml(when)}</strong></p>
    <p style="margin:0 0 6px;"><strong>${escapeHtml(n.petName)}</strong> — ${escapeHtml(services)}</p>
    ${addressHtml}
    <p style="margin:0 0 12px;">Payment is in person on the day (cash). See you soon!</p>
    <p style="margin:0;">— The Trims &amp; Bubbles team</p>
  `;
  await sendEmail({
    to: n.to,
    subject: `You're booked in — ${when}`,
    html: emailLayout(body),
    text: `Hi ${n.customerName}, your Trims & Bubbles booking is confirmed for ${when}. ${n.petName}: ${services}.${addressText} Payment in person (cash). See you soon!`,
  });
}
