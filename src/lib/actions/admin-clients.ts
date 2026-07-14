"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffOrOwner } from "@/lib/session";
import type { ActionResult } from "@/lib/actions/pets";

const notesSchema = z.string().max(5000, "That note is too long");

export async function updateClientInternalNotes(clientId: string, notes: string): Promise<ActionResult> {
  await requireStaffOrOwner();
  const parsed = notesSchema.safeParse(notes);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the note." };
  }
  await prisma.client.update({ where: { id: clientId }, data: { internalNotes: parsed.data.trim() || null } });
  revalidatePath(`/admin/clients/${clientId}`);
  return { status: "success" };
}
