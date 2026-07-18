"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { PetFormFields, type PetFormValues } from "@/components/pets/pet-form-fields";
import { updatePet } from "@/lib/actions/pets";
import type { SizeBand } from "@/components/booking/types";

export type EditablePet = {
  id: string;
  name: string;
  breed: string | null;
  sizeBand: SizeBand;
  weightKg: number | null;
  coatType: string | null;
  temperamentNotes: string | null;
};

function toFormValues(pet: EditablePet): PetFormValues {
  return {
    name: pet.name,
    breed: pet.breed ?? "",
    sizeBand: pet.sizeBand,
    weightKg: pet.weightKg != null ? String(pet.weightKg) : "",
    coatType: pet.coatType ?? "",
    temperamentNotes: pet.temperamentNotes ?? "",
  };
}

/** "Edit details" dialog reused by both the client portal and the admin pet
 * profile page. Server-side ownership is re-checked in `updatePet` either way. */
export function EditPetDialog({ pet }: { pet: EditablePet }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<PetFormValues>(() => toFormValues(pet));
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    if (next) setValues(toFormValues(pet));
    setOpen(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const weightKg = values.weightKg.trim() ? Number(values.weightKg) : undefined;
    startTransition(async () => {
      const result = await updatePet({
        petId: pet.id,
        name: values.name.trim(),
        breed: values.breed.trim() || undefined,
        sizeBand: values.sizeBand,
        weightKg,
        coatType: values.coatType.trim() || undefined,
        temperamentNotes: values.temperamentNotes.trim() || undefined,
      });
      if (result.status === "success") {
        toast.success("Details updated");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Pencil className="h-4 w-4" /> Edit details
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {pet.name}&apos;s details</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <PetFormFields idPrefix="edit-pet" values={values} onChange={(patch) => setValues((v) => ({ ...v, ...patch }))} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
