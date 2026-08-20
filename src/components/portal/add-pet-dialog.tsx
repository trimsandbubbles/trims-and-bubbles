"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { PetFormFields, EMPTY_PET_FORM_VALUES, type PetFormValues } from "@/components/pets/pet-form-fields";
import { runAction } from "@/lib/run-action";
import { createPet } from "@/lib/actions/pets";

export function AddPetDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<PetFormValues>(EMPTY_PET_FORM_VALUES);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    // runAction always surfaces a toast, even if the action throws (e.g. an
    // expired session), so the button never gets stuck on "Adding..." silently.
    const result = await runAction(
      () =>
        createPet({
          name: values.name.trim(),
          breed: values.breed.trim() || undefined,
          sizeBand: values.sizeBand,
          weightKg: values.weightKg.trim() ? Number(values.weightKg) : undefined,
          coatType: values.coatType.trim() || undefined,
          temperamentNotes: values.temperamentNotes.trim() || undefined,
        }),
      {
        success: `${values.name} added`,
        onSuccess: () => {
          setOpen(false);
          setValues(EMPTY_PET_FORM_VALUES);
          router.refresh();
        },
      },
    );
    if (!result || result.status === "error") setPending(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="h-4 w-4" /> Add a dog
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a dog</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <PetFormFields idPrefix="new-pet" values={values} onChange={(patch) => setValues((v) => ({ ...v, ...patch }))} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding..." : "Add dog"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
