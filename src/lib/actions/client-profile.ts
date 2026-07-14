"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

/**
 * Ensures the currently-logged-in user has a Client profile row, creating one
 * if this is their first time (e.g. straight after registration). Safe to
 * call defensively from anywhere a logged-in client might land — idempotent.
 */
export async function ensureClientProfile(phone?: string) {
  const session = await requireSession();
  return prisma.client.upsert({
    where: { userId: session.user.id },
    update: phone ? { phone } : {},
    create: { userId: session.user.id, phone: phone ?? null },
  });
}

export type MyPet = {
  id: string;
  name: string;
  breed: string | null;
  sizeBand: "SMALL" | "MEDIUM" | "LARGE";
  photoUrl: string | null;
};

/** The logged-in client's own (non-archived) pets, for the booking wizard's
 * "choose a dog" step. Returns [] for guests or staff/owner accounts. */
export async function getMyPets(): Promise<MyPet[]> {
  const session = await requireSession();
  const client = await prisma.client.findUnique({ where: { userId: session.user.id } });
  if (!client) return [];
  const pets = await prisma.pet.findMany({
    where: { clientId: client.id, archivedAt: null },
    select: { id: true, name: true, breed: true, sizeBand: true, photoUrl: true },
    orderBy: { createdAt: "asc" },
  });
  // Cast, not a schema change: the Prisma-generated SizeBand enum still
  // includes XL (kept in the DB, see project notes), but MyPet's UI-facing
  // type intentionally narrows to the sizes users can still see/select.
  return pets as MyPet[];
}
