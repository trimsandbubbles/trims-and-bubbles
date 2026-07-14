/**
 * The online store's product catalogue. Deliberately a small, static list
 * (like this file, not the database) — the owner can grow it later. Ordered
 * lines are snapshotted into the Order/OrderItem tables at checkout so past
 * receipts stay accurate even if prices here change.
 *
 * Money is integer cents everywhere (matches the rest of the app).
 */
export type StoreProduct = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  priceCents: number;
  /** Optional "was" price — renders a struck-through sale comparison. */
  compareAtCents?: number;
  image: string;
  category: string;
  badge?: string;
};

/** Flat-rate shipping, and the spend that unlocks free shipping. */
export const SHIPPING_CENTS = 995;
export const FREE_SHIPPING_THRESHOLD_CENTS = 6000;

/**
 * NOTE: This array is now only the initial SEED SOURCE for the catalogue.
 * The LIVE catalogue is the DB `Product` table (owner-editable at
 * /admin/products, read via `src/lib/store-data.ts`). `scripts/seed-products.ts`
 * upserts these into the DB by slug for the one-time cutover. Do not add new
 * products here expecting them to appear in the shop — add them in the admin.
 */
export const storeProducts: StoreProduct[] = [
  {
    slug: "joint-care-chews",
    name: "Joint Care Soft Chews",
    tagline: "Hip & joint mobility support",
    description:
      "Glucosamine + chondroitin soft chews that support healthy hips and joints — great for older dogs and active breeds. 30 chews.",
    priceCents: 2899,
    compareAtCents: 3499,
    image: "/store-images/product-1.jpg",
    category: "Supplements",
    badge: "Sale",
  },
  {
    slug: "salmon-rice-wet-food",
    name: "Salmon & Rice Wet Food",
    tagline: "Sensitive skin & stomach · 12-pack",
    description:
      "A gentle, grain-friendly salmon and rice recipe for dogs with sensitive skin and stomachs. Case of twelve 375g cans.",
    priceCents: 3499,
    image: "/store-images/product-2.jpg",
    category: "Food",
  },
  {
    slug: "allergy-immune-bites",
    name: "Allergy & Immune Bites",
    tagline: "Lamb flavour · 90 count",
    description:
      "Tasty lamb-flavoured soft chews with omega oils and probiotics to support skin, coat and a healthy immune system. 90 count.",
    priceCents: 3299,
    image: "/store-images/product-3.jpg",
    category: "Supplements",
  },
  {
    slug: "omega-oil-skin-coat",
    name: "Omega Oil Skin & Coat",
    tagline: "Wild fish oil · pump bottle",
    description:
      "Pure wild-caught fish oil rich in omega-3s for a shinier coat, healthier skin and joint support. Just pump over food.",
    priceCents: 2699,
    image: "/store-images/product-4.jpg",
    category: "Supplements",
  },
  {
    slug: "deshedding-shampoo",
    name: "deShedding Ultra Shampoo",
    tagline: "Reduces loose undercoat · 16 fl oz",
    description:
      "Salon-grade deshedding shampoo that loosens and washes away dead undercoat, leaving a soft, manageable, great-smelling coat.",
    priceCents: 1899,
    compareAtCents: 2299,
    image: "/store-images/product-5.jpg",
    category: "Grooming",
    badge: "Sale",
  },
  {
    slug: "pupsicle-refill-pops",
    name: "Pupsicle Refill Pops",
    tagline: "Long-lasting enrichment treats",
    description:
      "Allergy-friendly treat pops that keep busy dogs happily occupied — perfect for enrichment toys, crate time and calm chewing.",
    priceCents: 1499,
    image: "/store-images/product-6.jpg",
    category: "Treats & Toys",
  },
];

export function getProduct(slug: string): StoreProduct | undefined {
  return storeProducts.find((p) => p.slug === slug);
}
