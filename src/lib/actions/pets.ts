"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

const newPetSchema = z.object({
  name: z.string().min(1, "Your dog needs a name").max(60, "That name is too long"),
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
