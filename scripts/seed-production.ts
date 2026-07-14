/**
 * PRODUCTION seed — safe, idempotent, non-destructive.
 *
 * Creates only what a fresh live site needs:
 *   - business settings (if missing)
 *   - weekly availability (if none exists)
 *   - the real service menu (by slug; existing rows are never touched)
 *   - ONE owner login, from OWNER_EMAIL + OWNER_PASSWORD env vars
 *
 * It creates NO demo clients, NO demo staff, NO fake appointments — unlike the
 * dev seed (prisma/seed.ts), which must never run against production.
 *
 * Run (with DATABASE_URL pointing at the production DB):
 *   OWNER_EMAIL=... OWNER_PASSWORD=... npx tsx scripts/seed-production.ts
 *
 * Follow with scripts/seed-products.ts and scripts/seed-gallery.ts for the
 * shop catalogue and gallery starter content.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin as adminPlugin } from "better-auth/plugins";
import { ac, owner, staff, client as clientRole } from "../src/lib/permissions";
import { dayConfigs, serviceDefs } from "../prisma/seed-data";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Standalone Better Auth instance (same shape as src/lib/auth.ts) so the
// owner's password is hashed exactly the way the live app verifies it.
const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, requireEmailVerification: false },
  plugins: [
    adminPlugin({ ac, defaultRole: "client", adminRoles: ["owner", "staff"], roles: { owner, staff, client: clientRole } }),
  ],
});

async function main() {
  const ownerEmail = process.env.OWNER_EMAIL;
  const ownerPassword = process.env.OWNER_PASSWORD;
  const ownerName = process.env.OWNER_NAME || "Owner";

  console.log("Business settings...");
  const settings = await prisma.businessSettings.findUnique({ where: { id: 1 } });
  if (settings) {
    console.log("  exists — leaving untouched.");
  } else {
    await prisma.businessSettings.create({
      data: {
        id: 1,
        depositPercentage: 20,
        businessName: "Trims and Bubbles",
        contactEmail: "trimsandbubbles@gmail.com",
        contactPhone: null,
        bufferMinutes: 15,
      },
    });
    console.log("  created.");
  }

  console.log("Weekly availability...");
  const existingRules = await prisma.availabilityRule.count();
  if (existingRules > 0) {
    console.log(`  ${existingRules} rules exist — leaving untouched.`);
  } else {
    for (const d of dayConfigs) {
      await prisma.availabilityRule.create({
        data: { dayOfWeek: d.dayOfWeek, startTime: d.startTime, endTime: d.endTime, isActive: d.isActive },
      });
    }
    console.log(`  created ${dayConfigs.length} rules.`);
  }

  console.log("Services & pricing...");
  for (const s of serviceDefs) {
    const existing = await prisma.service.findUnique({ where: { slug: s.slug } });
    if (existing) {
      console.log(`  skipped (exists): ${s.slug}`);
      continue;
    }
    await prisma.service.create({
      data: {
        slug: s.slug,
        name: s.name,
        description: s.description,
        category: s.category,
        durationMinutes: s.durationMinutes,
        displayOrder: s.displayOrder,
        prices: {
          create: s.prices.map((p) => ({
            sizeBand: p.sizeBand,
            priceCents: p.priceCents,
            isOnInspection: p.isOnInspection ?? false,
          })),
        },
      },
    });
    console.log(`  created: ${s.slug}`);
  }

  console.log("Owner account...");
  const existingOwner = await prisma.user.findFirst({ where: { role: "owner" } });
  if (existingOwner) {
    console.log(`  an owner already exists (${existingOwner.email}) — leaving untouched.`);
    console.log("  (To change owner credentials, run: npx tsx scripts/set-owner-credentials.ts)");
  } else {
    if (!ownerEmail || !ownerPassword) {
      console.error(
        "  No owner exists and OWNER_EMAIL / OWNER_PASSWORD are not set.\n" +
          "  Re-run with both set to create the owner login."
      );
      process.exit(1);
    }
    const { user } = await auth.api.signUpEmail({
      body: { name: ownerName, email: ownerEmail, password: ownerPassword },
    });
    await prisma.user.update({ where: { id: user.id }, data: { role: "owner", emailVerified: true } });
    console.log(`  created owner: ${ownerEmail}`);
  }

  console.log("\n✅ Production seed complete. No demo data was created.");
  console.log("Next: npx tsx scripts/seed-products.ts && npx tsx scripts/seed-gallery.ts");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
