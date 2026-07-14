import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin as adminPlugin } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";
import { ac, owner, staff, client } from "@/lib/permissions";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  // Origins allowed to sign in / be used as auth redirect (callbackURL) targets.
  // Better Auth validates BOTH the Origin/Referer header AND callbackURL/redirectTo
  // against this list, so a wildcard here is also an open-redirect surface.
  //
  // The old wildcard `https://*.trycloudflare.com` is only safe in development:
  // anyone can spin up a free, anonymous Cloudflare quick tunnel, so trusting the
  // whole domain in production would let an attacker aim a real sign-in / reset
  // link at their own tunnel. In production we trust ONLY our real deployed
  // origin (BETTER_AUTH_URL, which Vercel-style hosts set for us); in dev we keep
  // localhost + the review tunnel so the owner-preview link still works.
  trustedOrigins: async () =>
    process.env.NODE_ENV === "production"
      ? [process.env.BETTER_AUTH_URL ?? ""].filter(Boolean)
      : ["http://localhost:3000", "https://*.trycloudflare.com"],
  // Brute-force / credential-stuffing protection on /sign-in, /sign-up, etc.
  // Better Auth enables rate limiting by default in production, but its default
  // in-memory store does NOT survive stateless serverless invocations (Vercel),
  // silently resetting per cold start. Postgres is already wired up, so use it.
  rateLimit: {
    storage: "database",
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    // Keep it simple for a small local grooming business — no email verification
    // step required to book/log in. Revisit before real launch if desired.
    requireEmailVerification: false,
  },
  plugins: [
    adminPlugin({
      ac,
      defaultRole: "client",
      adminRoles: ["owner", "staff"],
      roles: { owner, staff, client },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
