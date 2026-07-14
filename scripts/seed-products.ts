/**
 * One-time cutover helper: upserts the products that used to live in the
 * hardcoded `storeProducts` array in src/config/store.ts into the new
 * `Product` table, so the shop keeps its catalogue once the storefront reads
 * from the DB instead of that array.
 *
 * Idempotent and NON-DESTRUCTIVE — matches existing rows BY SLUG. A product
 * that already exists is LEFT UNTOUCHED (so any edits the owner has already
 * made in /admin/products are never overwritten); only missing products are
 * created. Safe to run repeatedly against a live DB without wiping anything.
 *
 * Run with: npx tsx scripts/seed-products.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { storeProducts } from "../src/config/store";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding store products...");

  let created = 0;
  let skipped = 0;

  for (const [index, p] of storeProducts.entries()) {
    const existing = await prisma.product.findUnique({ where: { slug: p.slug } });
    if (existing) {
      // Leave existing rows exactly as they are — never clobber owner edits.
      console.log(`  skipped (exists): ${p.slug}`);
      skipped++;
      continue;
    }

    await prisma.product.create({
      data: {
        slug: p.slug,
        name: p.name,
        tagline: p.tagline || null,
        description: p.description || null,
        priceCents: p.priceCents,
        compareAtCents: p.compareAtCents ?? null,
        imageUrl: p.image || null,
        category: p.category || null,
        badge: p.badge ?? null,
        active: true,
        soldOut: false,
        displayOrder: index,
      },
    });
    console.log(`  created: ${p.slug}`);
    created++;
  }

  console.log(`Done. ${created} created, ${skipped} left untouched.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
