import "server-only";

import { prisma } from "@/lib/prisma";
import type { Product } from "../generated/prisma/client";

/**
 * Server-side accessors for the live product catalogue.
 *
 * The catalogue lives in the DB `Product` table (owner-editable from
 * /admin/products). `src/config/store.ts` is now only the initial SEED SOURCE.
 * Money is integer cents everywhere, shown as dollars in the UI.
 */

export type StoreProductRecord = Product;

/**
 * Products for the public storefront: only active ones, in the owner's chosen
 * order (displayOrder, then oldest-first as a stable tie-breaker). Sold-out
 * products are still returned — the storefront shows them with a "Sold out"
 * state rather than hiding them.
 */
export async function getActiveProducts(): Promise<Product[]> {
  return prisma.product.findMany({
    where: { active: true },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
}

/** Every product (active or not) for the admin management screen. */
export async function getAllProductsForAdmin(): Promise<Product[]> {
  return prisma.product.findMany({
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });
}

/** A single product by its unique slug, or null. Used to re-resolve cart lines. */
export async function getProductBySlug(slug: string): Promise<Product | null> {
  return prisma.product.findUnique({ where: { slug } });
}
