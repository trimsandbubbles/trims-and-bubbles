import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * The ONLY trustworthy way to know who's making a request. proxy.ts only ever
 * does an optimistic "is there a session cookie at all" check for UX/redirect
 * purposes — every Server Action and Route Handler that touches client, pet,
 * appointment, or payment data must call one of these instead (Next.js 16's
 * own guidance: Server Actions bypass proxy matchers entirely).
 */
export async function getCurrentSession() {
  return auth.api.getSession({ headers: await headers() });
}

export type Role = "client" | "staff" | "owner";

/** Throws if there's no logged-in user at all. */
export async function requireSession() {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error("UNAUTHORIZED: you must be logged in.");
  }
  return session;
}

/** Throws unless the logged-in user is staff or the owner. */
export async function requireStaffOrOwner() {
  const session = await requireSession();
  const role = session.user.role;
  if (role !== "staff" && role !== "owner") {
    throw new Error("FORBIDDEN: staff/owner access only.");
  }
  return session;
}

/** Throws unless the logged-in user is the owner. */
export async function requireOwner() {
  const session = await requireSession();
  if (session.user.role !== "owner") {
    throw new Error("FORBIDDEN: owner access only.");
  }
  return session;
}

/**
 * Throws unless the logged-in user is the CLIENT who owns this client record
 * (or staff/owner, who can act on behalf of any client from the admin panel).
 * Returns the resolved Client row so callers don't have to re-fetch it.
 */
export async function requireOwnClientOrStaff(clientId: string) {
  const session = await requireSession();
  if (session.user.role === "staff" || session.user.role === "owner") {
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
    return { session, client };
  }
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || client.userId !== session.user.id) {
    throw new Error("FORBIDDEN: not your record.");
  }
  return { session, client };
}
