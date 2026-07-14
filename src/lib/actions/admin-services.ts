"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/session";
import type { ActionResult } from "@/lib/actions/pets";
import { validateAndProcessImage, saveImage, deleteImage, InvalidImageError } from "@/lib/uploads";

/** Like ActionResult, but a success may carry a human-readable note (e.g. when a
 * delete is downgraded to "hidden" because the service has booking history). */
export type ServiceActionResult =
  | { status: "success"; message?: string }
  | { status: "error"; message: string };

const priceRowSchema = z.object({
  id: z.string().min(1),
  priceCents: z.number().int().min(0),
  isOnInspection: z.boolean(),
});

const updateServiceSchema = z.object({
  serviceId: z.string().min(1),
  name: z.string().min(1, "Give the service a name"),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive("Duration must be at least 1 minute"),
  active: z.boolean(),
  prices: z.array(priceRowSchema).min(1),
});

/** Saves a service's own fields plus its whole size-band pricing matrix in
 * one submit — one card, one Save button, no separate screens. */
export async function updateServiceAndPrices(input: z.infer<typeof updateServiceSchema>): Promise<ActionResult> {
  await requireOwner();
  const parsed = updateServiceSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the details." };
  }
  const d = parsed.data;

  await prisma.$transaction([
    prisma.service.update({
      where: { id: d.serviceId },
      data: {
        name: d.name,
        description: d.description?.trim() || null,
        durationMinutes: d.durationMinutes,
        active: d.active,
      },
    }),
    ...d.prices.map((p) =>
      prisma.servicePrice.update({
        where: { id: p.id },
        data: { priceCents: p.isOnInspection ? 0 : p.priceCents, isOnInspection: p.isOnInspection },
      }),
    ),
  ]);

  revalidatePath("/admin/services");
  revalidatePath("/services");
  revalidatePath("/book");
  return { status: "success" };
}

/* -------------------------------------------------------------------------- */
/*  Create                                                                     */
/* -------------------------------------------------------------------------- */

const nameField = z.string().trim().min(1, "Give the service a name").max(80, "That name is too long");
const descriptionField = z.string().trim().max(1000, "That description is too long").optional();
const durationField = z.number().int().positive("Duration must be at least 1 minute").max(1440, "That's more than a day");

/** A CORE service is priced per dog size (Small/Medium/Large). A single
 * "quote after meeting the dog" toggle covers the whole service. */
const createCoreSchema = z.object({
  category: z.literal("CORE"),
  name: nameField,
  description: descriptionField,
  durationMinutes: durationField,
  isOnInspection: z.boolean().default(false),
  smallCents: z.number().int().min(0).default(0),
  mediumCents: z.number().int().min(0).default(0),
  largeCents: z.number().int().min(0).default(0),
});

/** An ADD_ON is a single flat fee (sizeBand null). */
const createAddOnSchema = z.object({
  category: z.literal("ADD_ON"),
  name: nameField,
  description: descriptionField,
  durationMinutes: durationField,
  priceCents: z.number().int().min(0).default(0),
});

const createServiceSchema = z.discriminatedUnion("category", [createCoreSchema, createAddOnSchema]);

export type CreateServiceInput = z.infer<typeof createServiceSchema>;

/** Turn free text into a URL-safe slug. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/**
 * Find a service slug not already used. Appends -2, -3, ... on collision.
 * Low-concurrency admin use — a simple lookup loop is plenty, and a leftover
 * race is still caught by the P2002 handler around the write.
 */
async function ensureUniqueSlug(base: string): Promise<string> {
  const root = base || "service";
  let candidate = root;
  let n = 2;
  while (true) {
    const existing = await prisma.service.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
    candidate = `${root}-${n++}`.slice(0, 120);
  }
}

function isSlugCollision(err: unknown): boolean {
  const e = err as { code?: string; meta?: { target?: unknown } };
  return e?.code === "P2002" && (Array.isArray(e.meta?.target) ? e.meta.target.includes("slug") : true);
}

/** Creates a brand-new service (or add-on) with its pricing rows. CORE gets one
 * ServicePrice per dog size (Small/Medium/Large — never XL); ADD_ON gets a
 * single flat-fee row (sizeBand null). Owner-only. */
export async function createService(input: CreateServiceInput): Promise<ServiceActionResult> {
  await requireOwner();
  const parsed = createServiceSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the details." };
  }
  const d = parsed.data;

  // displayOrder = (max existing + 1) so new services land at the end.
  const agg = await prisma.service.aggregate({ _max: { displayOrder: true } });
  const displayOrder = (agg._max.displayOrder ?? 0) + 1;

  const priceRows =
    d.category === "CORE"
      ? (["SMALL", "MEDIUM", "LARGE"] as const).map((sizeBand) => {
          const cents =
            sizeBand === "SMALL" ? d.smallCents : sizeBand === "MEDIUM" ? d.mediumCents : d.largeCents;
          return {
            sizeBand,
            priceCents: d.isOnInspection ? 0 : cents,
            isOnInspection: d.isOnInspection,
          };
        })
      : [{ sizeBand: null, priceCents: d.priceCents, isOnInspection: false }];

  try {
    const slug = await ensureUniqueSlug(slugify(d.name));
    await prisma.service.create({
      data: {
        name: d.name,
        slug,
        description: d.description?.trim() || null,
        category: d.category,
        durationMinutes: d.durationMinutes,
        displayOrder,
        active: true,
        prices: { create: priceRows },
      },
    });
  } catch (err) {
    if (isSlugCollision(err)) {
      return { status: "error", message: "A service with a very similar name already exists — try a different name." };
    }
    throw err;
  }

  revalidatePath("/admin/services");
  revalidatePath("/services");
  revalidatePath("/book");
  return { status: "success", message: `${d.name} added` };
}

/* -------------------------------------------------------------------------- */
/*  Delete                                                                     */
/* -------------------------------------------------------------------------- */

/** Removes a service. If it's referenced by any past/upcoming booking (as a
 * primary service or an add-on), it is HIDDEN (active=false) instead of deleted
 * so booking history stays intact. Otherwise it's hard-deleted (its ServicePrice
 * rows cascade). Owner-only. */
export async function deleteService(serviceId: string): Promise<ServiceActionResult> {
  await requireOwner();
  if (typeof serviceId !== "string" || serviceId.trim() === "") {
    return { status: "error", message: "Missing which service to remove." };
  }

  const [asPrimary, asAddOn] = await Promise.all([
    prisma.appointment.count({ where: { primaryServiceId: serviceId } }),
    prisma.appointmentAddOn.count({ where: { serviceId } }),
  ]);

  const hasHistory = asPrimary > 0 || asAddOn > 0;

  if (hasHistory) {
    await prisma.service.update({ where: { id: serviceId }, data: { active: false } });
    revalidatePath("/admin/services");
    revalidatePath("/services");
    revalidatePath("/book");
    return {
      status: "success",
      message: "This service has booking history, so it was hidden from the booking form instead of deleted (past appointments stay intact).",
    };
  }

  await prisma.service.delete({ where: { id: serviceId } });
  revalidatePath("/admin/services");
  revalidatePath("/services");
  revalidatePath("/book");
  return { status: "success", message: "Service removed" };
}

/* -------------------------------------------------------------------------- */
/*  Service photo                                                              */
/* -------------------------------------------------------------------------- */
/* The photo shown for this service on the public /services page and the home
 * page service cards. Runs through the shared safe-image pipeline (magic-byte
 * sniff + re-encode, strips EXIF), stored under public/uploads/services. */

/** The home page and public /services page both read Service.imageUrl, so a
 * photo change revalidates both plus the admin list. */
function revalidateServicePhoto() {
  revalidatePath("/admin/services");
  revalidatePath("/services");
  revalidatePath("/");
}

/** Uploads (or replaces) a service's photo. FormData carries the actual image
 * File straight from the phone/computer picker, mirroring addGalleryImage. Any
 * previous photo is deleted after the new one is saved. Owner-only. */
export async function setServicePhoto(serviceId: string, formData: FormData): Promise<ServiceActionResult> {
  await requireOwner();
  if (typeof serviceId !== "string" || serviceId.trim() === "") {
    return { status: "error", message: "Missing which service to update." };
  }

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) return { status: "error", message: "That service no longer exists." };

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return { status: "error", message: "Please choose a photo to upload." };
  }

  let url: string;
  try {
    const processed = await validateAndProcessImage(await photo.arrayBuffer());
    url = await saveImage(processed, "services");
  } catch (err) {
    // Surface the pipeline's own friendly message (e.g. the "too large" hint)
    // verbatim; fall back to the generic wrong-file-type message otherwise.
    const message =
      err instanceof InvalidImageError
        ? err.message
        : "That file doesn't look like a photo — please upload a JPG, PNG or WebP image.";
    return { status: "error", message };
  }

  await prisma.service.update({ where: { id: serviceId }, data: { imageUrl: url } });

  // Best-effort remove the old photo now that the new one is saved.
  if (service.imageUrl) {
    try {
      await deleteImage(service.imageUrl);
    } catch {
      // Best-effort: file already gone or otherwise unreachable.
    }
  }

  revalidateServicePhoto();
  return { status: "success", message: "Photo updated" };
}

/** Removes a service's photo (clears imageUrl and deletes the file). The public
 * pages fall back to the built-in stock photo for that service. Owner-only. */
export async function removeServicePhoto(serviceId: string): Promise<ServiceActionResult> {
  await requireOwner();
  if (typeof serviceId !== "string" || serviceId.trim() === "") {
    return { status: "error", message: "Missing which service to update." };
  }

  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) return { status: "error", message: "That service no longer exists." };
  if (!service.imageUrl) return { status: "success", message: "No photo to remove." };

  await prisma.service.update({ where: { id: serviceId }, data: { imageUrl: null } });

  try {
    await deleteImage(service.imageUrl);
  } catch {
    // Best-effort: file already gone or otherwise unreachable.
  }

  revalidateServicePhoto();
  return { status: "success", message: "Photo removed" };
}
