"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { SelectableCard } from "@/components/booking/selectable-card";
import { SIZE_BAND_LABELS, SIZE_BAND_HINTS } from "@/lib/format";
import { createPet } from "@/lib/actions/pets";
import type { SizeBand } from "@/components/booking/types";

export function AddPetDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [sizeBand, setSizeBand] = useState<SizeBand>("MEDIUM");
  const [coatType, setCoatType] = useState("");
  const [temperament, setTemperament] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    const result = await createPet({
      name: name.trim(),
      breed: breed.trim() || undefined,
      sizeBand,
      coatType: coatType.trim() || undefined,
      temperamentNotes: temperament.trim() || undefined,
    });
    setPending(false);
    if (result.status === "success") {
      toast.success(`${name} added`);
      setOpen(false);
      setName("");
      setBreed("");
      setCoatType("");
      setTemperament("");
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
          <div className="space-y-1.5">
            <Label htmlFor="new-pet-name">Name</Label>
            <Input id="new-pet-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-pet-breed">Breed (optional)</Label>
            <Input id="new-pet-breed" value={breed} onChange={(e) => setBreed(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Size</Label>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(SIZE_BAND_LABELS) as SizeBand[]).map((band) => (
                <SelectableCard
                  key={band}
                  selected={sizeBand === band}
                  onClick={() => setSizeBand(band)}
                  title={SIZE_BAND_LABELS[band]}
                  description={SIZE_BAND_HINTS[band]}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-pet-coat">Coat type (optional)</Label>
            <Input id="new-pet-coat" value={coatType} onChange={(e) => setCoatType(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-pet-temperament">Anything we should know? (optional)</Label>
            <Textarea id="new-pet-temperament" rows={2} value={temperament} onChange={(e) => setTemperament(e.target.value)} />
          </div>
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
