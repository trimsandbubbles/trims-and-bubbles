"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

const newPetSchema = z.object({
  // .trim() runs before the length checks, so "   " is rejected rather than
  // being stored as a blank-looking name.
  name: z.string().trim().min(1, "Your dog needs a name").max(60, "That name is too long"),
  breed: z.string().max(80).optional(),
  sizeBand: z.enum(["SMALL", "MEDIUM", "LARGE"]),
  weightKg: z.number().positive().max(200).optional(),
  coatType: z.string().max(80).optional(),
  temperamentNotes: z.string().max(1000).optional(),
});

export type ActionResult = { status: "success" } | { status: "error"; message: string };

export async function createPet(input: z.infer<typeof newPetSchema>): Promise<ActionResult> {
  const parsed = newPetSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the details." };
  }
  const session = await requireSession();
  const client = await prisma.client.upsert({
    where: { userId: session.user.id },
    update: {},
    create: { userId: session.user.id },
  });

  const d = parsed.data;
  await prisma.pet.create({
    data: {
      clientId: client.id,
      name: d.name,
      breed: d.breed || null,
      sizeBand: d.sizeBand,
      weightKg: d.weightKg,
      coatType: d.coatType || null,
      temperamentNotes: d.temperamentNotes || null,
    },
  });

  revalidatePath("/portal/pets");
  return { status: "success" };
}

const editPetSchema = z.object({
  petId: z.string().min(1),
  // .trim() runs before the length checks, so "   " is rejected rather than
  // being stored as a blank-looking name.
  name: z.string().trim().min(1, "Your dog needs a name").max(60, "That name is too long"),
  breed: z.string().max(80).optional(),
  sizeBand: z.enum(["SMALL", "MEDIUM", "LARGE"]),
  weightKg: z.number().positive().max(200).optional(),
  coatType: z.string().max(80).optional(),
  temperamentNotes: z.string().max(1000).optional(),
});

const petIdSchema = z.object({ petId: z.string().min(1) });

/**
 * Loads the pet + owning client and checks that the caller is allowed to
 * modify it: staff/owner may act on any pet, otherwise the caller must be
 * the client who owns it. Never trust a petId's ownership from the client.
 */
async function loadPetForMutation(petId: string) {
  const session = await requireSession();
  const pet = await prisma.pet.findUnique({ where: { id: petId }, include: { client: true } });
  if (!pet) {
    return { ok: false as const, error: { status: "error" as const, message: "That dog couldn't be found." } };
  }
  const role = session.user.role;
  if (role !== "staff" && role !== "owner" && pet.client.userId !== session.user.id) {
    return { ok: false as const, error: { status: "error" as const, message: "That isn't your dog." } };
  }
  return { ok: true as const, pet };
}

function revalidatePetPaths(petId: string, clientId: string) {
  revalidatePath("/portal/pets");
  revalidatePath(`/portal/pets/${petId}`);
  revalidatePath(`/admin/pets/${petId}`);
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/clients");
}

export async function updatePet(input: z.infer<typeof editPetSchema>): Promise<ActionResult> {
  const parsed = editPetSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the details." };
  }

  const access = await loadPetForMutation(parsed.data.petId);
  if (!access.ok) return access.error;

  const d = parsed.data;
  await prisma.pet.update({
    where: { id: d.petId },
    data: {
      name: d.name,
      breed: d.breed || null,
      sizeBand: d.sizeBand,
      weightKg: d.weightKg ?? null,
      coatType: d.coatType || null,
      temperamentNotes: d.temperamentNotes || null,
    },
  });

  revalidatePetPaths(d.petId, access.pet.clientId);
  return { status: "success" };
}

/**
 * "Remove a dog" from the owner's/client's perspective. If the pet has no
 * grooming history it's hard-deleted; otherwise it's soft-archived (so the
 * appointment history's FK stays intact) and simply disappears from every
 * list, which already filters on `archivedAt: null`.
 */
export async function removePet(input: { petId: string }): Promise<ActionResult> {
  const parsed = petIdSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Please try again." };
  }

  const access = await loadPetForMutation(parsed.data.petId);
  if (!access.ok) return access.error;
  const { id: petId, clientId } = access.pet;

  const appointmentCount = await prisma.appointment.count({ where: { petId } });
  if (appointmentCount === 0) {
    await prisma.pet.delete({ where: { id: petId } });
  } else {
    await prisma.pet.update({ where: { id: petId }, data: { archivedAt: new Date() } });
  }

  revalidatePetPaths(petId, clientId);
  return { status: "success" };
}
