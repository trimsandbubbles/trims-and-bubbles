"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { PetFormFields, EMPTY_PET_FORM_VALUES, type PetFormValues } from "@/components/pets/pet-form-fields";
import { createPet } from "@/lib/actions/pets";

export function AddPetDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<PetFormValues>(EMPTY_PET_FORM_VALUES);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const result = await createPet({
      name: values.name.trim(),
      breed: values.breed.trim() || undefined,
      sizeBand: values.sizeBand,
      weightKg: values.weightKg.trim() ? Number(values.weightKg) : undefined,
      coatType: values.coatType.trim() || undefined,
      temperamentNotes: values.temperamentNotes.trim() || undefined,
    });
    setPending(false);
    if (result.status === "success") {
      toast.success(`${values.name} added`);
      setOpen(false);
      setValues(EMPTY_PET_FORM_VALUES);
      router.refresh();
    } else {
      toast.error(result.message);
    }
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
