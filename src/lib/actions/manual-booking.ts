"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffOrOwner } from "@/lib/session";
import { checkSlotStillOpen } from "@/lib/availability-data";
import { getBusinessSettings } from "@/lib/services-data";
import { resolveOwnerEmail } from "@/lib/owner-email";
import { sendEmail, escapeHtml, emailLayout, BOOKING_HIGHLIGHTS_HTML, BOOKING_HIGHLIGHTS_TEXT } from "@/lib/email";
import { formatCents } from "@/lib/format";

/**
 * Owner/staff-created booking for a customer who called, emailed or walked in.
 * Unlike the public wizard (which books for the logged-in visitor), this books
 * on behalf of ANY customer — an existing client, or a brand-new call-in for
 * whom we create a lightweight account so the appointment has somewhere to live.
 *
 * Supports ONE OR MORE dogs in a single visit (each dog can be an existing pet
 * or a quick-added one, and each gets its own service selection). Because
 * there's one groomer, the dogs are scheduled BACK-TO-BACK from the chosen start
 * time — N sibling appointments sharing a bookingGroupId, created in one
 * transaction so a mid-way clash rolls the whole group back.
 *
 * Trusted action (owner/staff only), so it's deliberately more flexible than
 * the public flow: the time isn't forced onto the offered slot grid or the
 * client lead-time — the owner can slot someone in wherever there's room. The
 * only hard rule is "don't overlap another booking", enforced here by the same
 * soft check the wizard uses AND, ultimately, by the Postgres exclusion
 * constraint that makes a true double-book structurally impossible.
 */

type SizeBand = "SMALL" | "MEDIUM" | "LARGE";

const SIZE_LABEL: Record<SizeBand, string> = {
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
function normalizeSize(size: string): SizeBand {
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

/** One dog in the booking: which dog + the service(s) chosen for it. */
const dogLineSchema = z.object({
  dog: dogSchema,
  serviceIds: z.array(z.string().min(1)).min(1, "Please pick at least one service for each dog.").max(10),
});

const MAX_DOGS = 6;

const schema = z.object({
  customer: customerSchema,
  dogs: z.array(dogLineSchema).min(1, "Please add at least one dog.").max(MAX_DOGS, `Please add at most ${MAX_DOGS} dogs.`),
  startAt: z.iso.datetime(),
  note: z.string().max(1000).optional(),
});

export type ManualBookingInput = z.infer<typeof schema>;

export type ManualBookingResult =
  | { status: "success"; appointmentId: string }
  | { status: "error"; message: string };

/** A fully priced + timed dog line, ready to write as one appointment. */
type ResolvedDog = {
  existingPetId: string | null;
  newPet: { name: string; breed: string | null; sizeBand: SizeBand } | null;
  petName: string;
  sizeBand: SizeBand;
  primaryServiceId: string;
  serviceNames: string[];
  addOnRows: { serviceId: string; priceCentsAtBooking: number }[];
  durationMinutes: number;
  priceCents: number;
};

export async function createManualBooking(rawInput: ManualBookingInput): Promise<ManualBookingResult> {
  await requireStaffOrOwner();

  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the details." };
  }
  const input = parsed.data;

  // A brand-new customer has no saved dogs, so every dog must be entered fresh.
  if (input.customer.mode === "new" && input.dogs.some((d) => d.dog.mode === "existing")) {
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

  // ---- Resolve each dog line (pet + size + services + price + duration) ------
  const resolved: ResolvedDog[] = [];
  for (const line of input.dogs) {
    // The dog + its size.
    let sizeBand: SizeBand;
    let existingPetId: string | null = null;
    let newPet: { name: string; breed: string | null; sizeBand: SizeBand } | null = null;
    let petName: string;

    if (line.dog.mode === "existing") {
      const pet = await prisma.pet.findFirst({
        where: { id: line.dog.petId, clientId, archivedAt: null },
      });
      if (!pet) return { status: "error", message: "One of the dogs wasn't found on this customer's account." };
      sizeBand = normalizeSize(pet.sizeBand);
      existingPetId = pet.id;
      petName = pet.name;
    } else {
      sizeBand = line.dog.sizeBand;
      petName = line.dog.name?.trim() || SIZE_LABEL[sizeBand];
      newPet = { name: petName, breed: line.dog.breed?.trim() || null, sizeBand };
    }

    // The chosen services (one or more), priced for this dog's size.
    const uniqueServiceIds = [...new Set(line.serviceIds)];
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
    const primaryId = line.serviceIds[0];
    const primary = pricedCores.find((c) => c.service.id === primaryId) ?? pricedCores[0];
    const extraCores = pricedCores.filter((c) => c.service.id !== primary.service.id);

    // One drop-off slot per dog: the visit is as long as its LONGEST service,
    // not the sum — the dog stays for the day, so services don't stack up time.
    const durationMinutes = Math.max(...coreServices.map((s) => s.durationMinutes));
    const priceCents =
      (primary.row!.isOnInspection ? 0 : primary.row!.priceCents) +
      extraCores.reduce((s, c) => s + (c.row!.isOnInspection ? 0 : c.row!.priceCents), 0);
    const addOnRows = extraCores.map((c) => ({
      serviceId: c.service.id,
      priceCentsAtBooking: c.row!.isOnInspection ? 0 : c.row!.priceCents,
    }));

    resolved.push({
      existingPetId,
      newPet,
      petName,
      sizeBand,
      primaryServiceId: primary.service.id,
      serviceNames: [primary.service.name, ...extraCores.map((c) => c.service.name)],
      addOnRows,
      durationMinutes,
      priceCents,
    });
  }

  // ---- Validate the time (future + no overlap for the WHOLE back-to-back
  // block). Owner-trusted, so no grid or lead-time constraint. ----------------
  const totalDuration = resolved.reduce((s, r) => s + r.durationMinutes, 0);
  const totalPriceCents = resolved.reduce((s, r) => s + r.priceCents, 0);
  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.getTime())) return { status: "error", message: "That's not a valid time." };
  if (startAt.getTime() < Date.now()) {
    return { status: "error", message: "That time has already passed — please pick another." };
  }
  const blockEnd = new Date(startAt.getTime() + totalDuration * 60_000);
  const dateStr = startAt.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }); // YYYY-MM-DD
  const stillOpen = await checkSlotStillOpen(dateStr, { startAt, endAt: blockEnd });
  if (!stillOpen) {
    return { status: "error", message: "That time overlaps another booking — please pick another." };
  }

  const bookingGroupId = randomUUID();
  let appointmentId: string;
  try {
    appointmentId = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      let cursor = startAt;
      for (let i = 0; i < resolved.length; i++) {
        const r = resolved[i];

        let petId = r.existingPetId;
        if (!petId && r.newPet) {
          const pet = await tx.pet.create({
            data: { clientId, name: r.newPet.name, breed: r.newPet.breed, sizeBand: r.newPet.sizeBand },
          });
          petId = pet.id;
        }
        if (!petId) throw new Error("no pet resolved for manual booking");

        const apptEnd = new Date(cursor.getTime() + r.durationMinutes * 60_000);
        const appt = await tx.appointment.create({
          data: {
            clientId,
            petId,
            primaryServiceId: r.primaryServiceId,
            startAt: cursor,
            endAt: apptEnd,
            status: "CONFIRMED",
            sizeBandAtBooking: r.sizeBand,
            totalPriceCents: r.priceCents,
            depositPriceCents: null,
            // Booking-level note lives on the first appointment only.
            notesFromClient: i === 0 ? input.note?.trim() || null : null,
            bookingGroupId,
            addOns: { create: r.addOnRows },
          },
        });
        ids.push(appt.id);
        cursor = apptEnd;
      }
      return ids[0];
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
    const settings = await getBusinessSettings();
    await sendManualBookingEmail({
      to: customerEmail,
      customerName,
      startAt,
      bookingAddress: settings.bookingAddress || null,
      totalCents: totalPriceCents,
      dogs: resolved.map((r) => ({ petName: r.petName, serviceNames: r.serviceNames })),
      replyTo: resolveOwnerEmail(settings.contactEmail),
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
  startAt: Date;
  bookingAddress: string | null;
  totalCents: number;
  dogs: { petName: string; serviceNames: string[] }[];
  replyTo: string;
}): Promise<void> {
  const when = WHEN_FMT.format(n.startAt);
  const listHtml = `<ul style="margin:0 0 12px;padding-left:18px;">${n.dogs
    .map((d) => `<li style="margin:0 0 4px;"><strong>${escapeHtml(d.petName)}</strong> — ${escapeHtml(d.serviceNames.join(" + "))}</li>`)
    .join("")}</ul>`;
  const listText = n.dogs.map((d) => `${d.petName}: ${d.serviceNames.join(" + ")}`).join("; ");
  const amountHtml =
    n.totalCents > 0
      ? `<p style="margin:0 0 12px;">Amount to pay on the day: <strong>${escapeHtml(formatCents(n.totalCents))}</strong></p>`
      : "";
  const amountText = n.totalCents > 0 ? ` Amount to pay on the day: ${formatCents(n.totalCents)}.` : "";
  const addressHtml = n.bookingAddress
    ? `<p style="margin:0 0 12px;">Drop-off address: <strong>${escapeHtml(n.bookingAddress)}</strong></p>`
    : "";
  const addressText = n.bookingAddress ? ` Drop-off address: ${n.bookingAddress}.` : "";
  const body = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(n.customerName)},</p>
    <p style="margin:0 0 12px;">Your booking with Trims &amp; Bubbles is confirmed. 🐾</p>
    ${BOOKING_HIGHLIGHTS_HTML}
    <p style="margin:0 0 6px;">When: <strong>${escapeHtml(when)}</strong></p>
    ${listHtml}
    ${amountHtml}
    ${addressHtml}
    <p style="margin:0 0 12px;">See you soon!</p>
    <p style="margin:0;">— The Trims &amp; Bubbles team</p>
  `;
  await sendEmail({
    to: n.to,
    subject: `You're booked in — ${when}`,
    html: emailLayout(body),
    text: `Hi ${n.customerName}, your Trims & Bubbles booking is confirmed for ${when}. ${listText}.${amountText}${addressText} ${BOOKING_HIGHLIGHTS_TEXT} See you soon!`,
    replyTo: n.replyTo,
  });
}
