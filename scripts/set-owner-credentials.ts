/**
 * Change the owner login (email and/or password) on whatever database
 * DATABASE_URL points at. Uses Better Auth's own password hasher so the new
 * password verifies exactly like one set through the app.
 *
 * Also signs the owner out everywhere (deletes their sessions) so any old
 * login on another device stops working immediately.
 *
 * Run:
 *   OWNER_EMAIL=new@email.com OWNER_PASSWORD='newpass' npx tsx scripts/set-owner-credentials.ts
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin as adminPlugin } from "better-auth/plugins";
import { ac, owner, staff, client as clientRole } from "../src/lib/permissions";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

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
  const newEmail = process.env.OWNER_EMAIL;
  const newPassword = process.env.OWNER_PASSWORD;
  if (!newEmail && !newPassword) {
    console.error("Set OWNER_EMAIL and/or OWNER_PASSWORD env vars, then re-run.");
    process.exit(1);
  }
  if (newPassword && newPassword.length < 8) {
    console.error("OWNER_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  const owners = await prisma.user.findMany({ where: { role: "owner" } });
  if (owners.length === 0) {
    console.error("No owner account found. Run scripts/seed-production.ts first.");
    process.exit(1);
  }
  if (owners.length > 1) {
    console.error(
      `Found ${owners.length} owner accounts (${owners.map((o) => o.email).join(", ")}).\n` +
        "Refusing to guess — remove the extra owner in the database first."
    );
    process.exit(1);
  }
  const ownerUser = owners[0];

  if (newEmail && newEmail !== ownerUser.email) {
    const taken = await prisma.user.findFirst({ where: { email: newEmail, id: { not: ownerUser.id } } });
    if (taken) {
      console.error(`Another account already uses ${newEmail} — refusing to overwrite it.`);
      process.exit(1);
    }
    await prisma.user.update({
      where: { id: ownerUser.id },
      data: { email: newEmail, emailVerified: true },
    });
    console.log(`Email: ${ownerUser.email} -> ${newEmail}`);
  }

  if (newPassword) {
    const credentialAccount = await prisma.account.findFirst({
      where: { userId: ownerUser.id, providerId: "credential" },
    });
    if (!credentialAccount) {
      console.error("Owner has no email/password credential account — cannot set a password.");
      process.exit(1);
    }
    const ctx = await auth.$context;
    const hashed = await ctx.password.hash(newPassword);
    await prisma.account.update({ where: { id: credentialAccount.id }, data: { password: hashed } });
    console.log("Password: updated (hashed with Better Auth's hasher).");
  }

  const { count } = await prisma.session.deleteMany({ where: { userId: ownerUser.id } });
  console.log(`Signed the owner out of ${count} existing session(s).`);
  console.log("✅ Done. The owner logs in with the new details from now on.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
