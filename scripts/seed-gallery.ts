/**
 * One-time cutover helper: upserts the 4 images that used to live in the
 * hardcoded `extraShowcase` array in src/app/(marketing)/gallery/page.tsx
 * into the new GalleryImage table, so the public gallery keeps showing them
 * once that hardcoded array is removed.
 *
 * Idempotent — matches existing rows by `url`, so it's safe to run more than
 * once against a live DB without creating duplicates or wiping anything else.
 *
 * Run with: npx tsx scripts/seed-gallery.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const EXTRA_SHOWCASE = [
  { url: "/seed-images/gallery-husky.jpg", caption: "Husky — Groom Out", groupLabel: "Groom Out" },
  { url: "/seed-images/gallery-corgi.jpg", caption: "Corgi — Wash and Tidy", groupLabel: "Wash and Tidy" },
  { url: "/seed-images/gallery-cavalier.jpg", caption: "Cocker Spaniel — Wash and Dry", groupLabel: "Wash and Dry" },
  { url: "/seed-images/gallery-shepherd.jpg", caption: "German Shepherd — Deshed", groupLabel: "Deshed" },
];

async function main() {
  console.log("Seeding gallery images...");

  for (const [index, item] of EXTRA_SHOWCASE.entries()) {
    const existing = await prisma.galleryImage.findFirst({ where: { url: item.url } });
    if (existing) {
      await prisma.galleryImage.update({
        where: { id: existing.id },
        data: { caption: item.caption, groupLabel: item.groupLabel },
      });
      console.log(`  updated: ${item.url}`);
    } else {
      await prisma.galleryImage.create({
        data: {
          url: item.url,
          caption: item.caption,
          groupLabel: item.groupLabel,
          displayOrder: index,
          active: true,
        },
      });
      console.log(`  created: ${item.url}`);
    }
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
