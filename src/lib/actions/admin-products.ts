"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/session";
import type { ActionResult } from "@/lib/actions/pets";
import { validateAndProcessImage, saveImage, deleteImage } from "@/lib/uploads";

/**
 * Owner-facing product management for the online store.
 *
 * The live catalogue is the DB `Product` table. Every action here is guarded
 * with `requireOwner()` — pricing and availability are owner-critical, matching
 * the services/pricing editor. Prices are entered in DOLLARS in the UI and
 * stored as integer cents. Slugs are unique; we auto-generate one from the name
 * when blank and gracefully handle collisions.
 *
 * Create/update are FormData actions so they can carry the photo File straight
 * from the phone's file/camera input, re-using the safe image pipeline
 * (`validateAndProcessImage` + `saveImage`, subdir "products").
 */

/** Upper bound on any single price: $100,000 in cents. Keeps a fat-fingered
 * entry from becoming an absurd order total. */
const MAX_PRICE_CENTS = 100_000_00;

const productSchema = z
  .object({
    name: z.string().min(1, "Give the product a name.").max(120, "Name is too long."),
    slug: z
      .string()
      .max(120, "Slug is too long.")
      .regex(/^[a-z0-9-]*$/, "Slug can only contain lowercase letters, numbers and hyphens.")
      .optional(),
    tagline: z.string().max(160, "Tagline is too long.").optional(),
    description: z.string().max(2000, "Description is too long.").optional(),
    priceCents: z
      .number({ error: "Enter a valid price." })
      .int()
      .min(0, "Price can't be negative.")
      .max(MAX_PRICE_CENTS, "That price looks too high."),
    compareAtCents: z
      .number()
      .int()
      .min(0, "Compare-at price can't be negative.")
      .max(MAX_PRICE_CENTS, "That compare-at price looks too high.")
      .optional(),
    category: z.string().max(60, "Category is too long.").optional(),
    badge: z.string().max(40, "Badge is too long.").optional(),
    active: z.boolean(),
    soldOut: z.boolean(),
    displayOrder: z.number().int().min(0).max(100000),
  })
  .refine((d) => d.compareAtCents === undefined || d.compareAtCents > d.priceCents, {
    message: "Compare-at price should be higher than the price.",
    path: ["compareAtCents"],
  });

type ProductInput = z.infer<typeof productSchema>;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Turn free text into a URL-safe slug. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/** Dollars string (e.g. "28.99") -> integer cents, or null if not a number. */
function dollarsToCents(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return NaN; // signals "provided but invalid"
  return Math.round(value * 100);
}

/**
 * Find a slug not already used by another product. Appends -2, -3, ... on
 * collision. `excludeId` lets a product keep its own slug on update.
 */
async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = base || "product";
  let candidate = root;
  let n = 2;
  // Low-concurrency admin use — a simple lookup loop is plenty. A leftover race
  // is still caught by the P2002 handler around the write.
  while (true) {
    const existing = await prisma.product.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${root}-${n++}`.slice(0, 120);
  }
}

/** Persist an uploaded product photo through the safe pipeline. Returns the
 * public URL, or null if the bytes aren't a genuine JPEG/PNG/WebP. */
async function saveProductPhoto(file: File): Promise<string | null> {
  try {
    const processed = await validateAndProcessImage(await file.arrayBuffer());
    return await saveImage(processed, "products");
  } catch {
    return null;
  }
}

/** Parse the shared product fields out of a FormData payload. Returns either a
 * validated input object or a friendly error message. */
function parseProductForm(formData: FormData):
  | { ok: true; data: ProductInput; slugProvided: boolean }
  | { ok: false; message: string } {
  const priceCents = dollarsToCents(String(formData.get("price") ?? ""));
  if (priceCents === null || Number.isNaN(priceCents)) {
    return { ok: false, message: "Enter a valid price." };
  }

  const compareRaw = String(formData.get("compareAt") ?? "");
  const compareAtCents = dollarsToCents(compareRaw);
  if (compareAtCents !== null && Number.isNaN(compareAtCents)) {
    return { ok: false, message: "Enter a valid compare-at price." };
  }

  const rawSlug = String(formData.get("slug") ?? "").trim();
  const displayOrderRaw = String(formData.get("displayOrder") ?? "").trim();
  const displayOrder = displayOrderRaw === "" ? 0 : Number(displayOrderRaw);

  const candidate = {
    name: String(formData.get("name") ?? "").trim(),
    slug: rawSlug === "" ? undefined : slugify(rawSlug),
    tagline: String(formData.get("tagline") ?? "").trim() || undefined,
    description: String(formData.get("description") ?? "").trim() || undefined,
    priceCents,
    compareAtCents: compareAtCents === null ? undefined : compareAtCents,
    category: String(formData.get("category") ?? "").trim() || undefined,
    badge: String(formData.get("badge") ?? "").trim() || undefined,
    active: String(formData.get("active") ?? "true") === "true",
    soldOut: String(formData.get("soldOut") ?? "false") === "true",
    displayOrder: Number.isFinite(displayOrder) ? displayOrder : 0,
  };

  const parsed = productSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check the details." };
  }
  return { ok: true, data: parsed.data, slugProvided: rawSlug !== "" };
}

function revalidateStore() {
  revalidatePath("/admin/products");
  revalidatePath("/store");
}

function isSlugCollision(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    (err.meta?.target as string[] | undefined)?.includes("slug") === true
  );
}

/* -------------------------------------------------------------------------- */
/*  Actions                                                                    */
/* -------------------------------------------------------------------------- */

export async function createProduct(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const parsed = parseProductForm(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };
  const d = parsed.data;

  // Auto-generate a slug from the name when the owner left it blank.
  const baseSlug = d.slug ?? slugify(d.name);
  const slug = await ensureUniqueSlug(baseSlug);

  // Handle the photo (optional) before the DB write so a bad image aborts cleanly.
  let imageUrl: string | null = null;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    imageUrl = await saveProductPhoto(photo);
    if (!imageUrl) {
      return {
        status: "error",
        message: "That file doesn't look like a photo — please upload a JPG, PNG or WebP image.",
      };
    }
  }

  try {
    await prisma.product.create({
      data: {
        slug,
        name: d.name,
        tagline: d.tagline ?? null,
        description: d.description ?? null,
        priceCents: d.priceCents,
        compareAtCents: d.compareAtCents ?? null,
        imageUrl,
        category: d.category ?? null,
        badge: d.badge ?? null,
        active: d.active,
        soldOut: d.soldOut,
        displayOrder: d.displayOrder,
      },
    });
  } catch (err) {
    if (imageUrl) await deleteImage(imageUrl); // don't orphan the upload
    if (isSlugCollision(err)) {
      return { status: "error", message: "That web address (slug) is already taken — try another." };
    }
    throw err;
  }

  revalidateStore();
  return { status: "success" };
}

export async function updateProduct(formData: FormData): Promise<ActionResult> {
  await requireOwner();

  const id = String(formData.get("id") ?? "");
  if (!id) return { status: "error", message: "Missing product." };

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return { status: "error", message: "That product no longer exists." };

  const parsed = parseProductForm(formData);
  if (!parsed.ok) return { status: "error", message: parsed.message };
  const d = parsed.data;

  const baseSlug = d.slug ?? slugify(d.name);
  const slug = await ensureUniqueSlug(baseSlug, id);

  // Photo handling: a new upload replaces the old; an explicit remove clears it.
  const removeImage = String(formData.get("removeImage") ?? "") === "true";
  let imageUrl: string | null | undefined = undefined; // undefined = leave unchanged
  let newlySaved: string | null = null;

  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    newlySaved = await saveProductPhoto(photo);
    if (!newlySaved) {
      return {
        status: "error",
        message: "That file doesn't look like a photo — please upload a JPG, PNG or WebP image.",
      };
    }
    imageUrl = newlySaved;
  } else if (removeImage) {
    imageUrl = null;
  }

  try {
    await prisma.product.update({
      where: { id },
      data: {
        slug,
        name: d.name,
        tagline: d.tagline ?? null,
        description: d.description ?? null,
        priceCents: d.priceCents,
        compareAtCents: d.compareAtCents ?? null,
        ...(imageUrl !== undefined ? { imageUrl } : {}),
        category: d.category ?? null,
        badge: d.badge ?? null,
        active: d.active,
        soldOut: d.soldOut,
        displayOrder: d.displayOrder,
      },
    });
  } catch (err) {
    if (newlySaved) await deleteImage(newlySaved); // don't orphan the upload
    if (isSlugCollision(err)) {
      return { status: "error", message: "That web address (slug) is already taken — try another." };
    }
    throw err;
  }

  // Best-effort cleanup of the replaced/removed old photo, after a successful write.
  if (imageUrl !== undefined && existing.imageUrl && existing.imageUrl !== imageUrl) {
    await deleteImage(existing.imageUrl);
  }

  revalidateStore();
  return { status: "success" };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  await requireOwner();
  if (!id) return { status: "error", message: "Missing product." };

  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return { status: "error", message: "That product no longer exists." };

  await prisma.product.delete({ where: { id } });

  // Best-effort: remove the stored photo so we don't orphan files on disk.
  if (existing.imageUrl) await deleteImage(existing.imageUrl);

  revalidateStore();
  return { status: "success" };
}

/** Quick availability toggle so the owner can sell out / restock in one tap. */
export async function setProductSoldOut(id: string, soldOut: boolean): Promise<ActionResult> {
  await requireOwner();
  if (!id) return { status: "error", message: "Missing product." };

  try {
    await prisma.product.update({ where: { id }, data: { soldOut } });
  } catch {
    return { status: "error", message: "That product no longer exists." };
  }

  revalidateStore();
  return { status: "success" };
}
