import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires an explicit driver adapter — see AGENTS.md, this is not the
// implicit-engine Prisma most tutorials show.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// `options: -c timezone=UTC` pins every connection's session timezone.
//
// This is not cosmetic. Timestamps are sent to Postgres as naive UTC wall-clock
// strings, so the SERVER's timezone decides how they're interpreted. Against a
// UTC server (Neon, production) that's correct. Against a server that inherited
// a local timezone — an `initdb` on a Windows box picks up the OS locale, which
// is how a local instance here ended up on America/Los_Angeles — every
// appointment silently lands in the database several hours off the time the
// customer actually chose. Verified: same write, 7h drift on a LA-timezone
// server, 0h drift with this pinned to UTC.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  options: "-c timezone=UTC",
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
