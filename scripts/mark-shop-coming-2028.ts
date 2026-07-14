/**
 * Launch state for the shop: every product out of stock with a
 * "Coming in 2028" badge (the shop is visible but nothing is purchasable).
 * The owner can flip products back on any time in /admin/products.
 *
 * Run with: npx tsx scripts/mark-shop-coming-2028.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const { count } = await prisma.product.updateMany({
    data: { soldOut: true, badge: "Coming in 2028" },
  });
  console.log(`✅ ${count} products set to out of stock with badge "Coming in 2028".`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
