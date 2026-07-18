"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectableCard } from "@/components/booking/selectable-card";
import { SIZE_BAND_LABELS, SIZE_BAND_HINTS } from "@/lib/format";
import type { SizeBand } from "@/components/booking/types";

/** Shared, controlled field set for both "Add a dog" and "Edit details". */
export type PetFormValues = {
  name: string;
  breed: string;
  sizeBand: SizeBand;
  weightKg: string;
  coatType: string;
  temperamentNotes: string;
};

export const EMPTY_PET_FORM_VALUES: PetFormValues = {
  name: "",
  breed: "",
  sizeBand: "MEDIUM",
  weightKg: "",
  coatType: "",
  temperamentNotes: "",
};

export function PetFormFields({
  idPrefix,
  values,
  onChange,
}: {
  idPrefix: string;
  values: PetFormValues;
  onChange: (patch: Partial<PetFormValues>) => void;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
        <Input id={`${idPrefix}-name`} required value={values.name} onChange={(e) => onChange({ name: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-breed`}>Breed (optional)</Label>
        <Input id={`${idPrefix}-breed`} value={values.breed} onChange={(e) => onChange({ breed: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Size</Label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(SIZE_BAND_LABELS) as SizeBand[]).map((band) => (
            <SelectableCard
              key={band}
              selected={values.sizeBand === band}
              onClick={() => onChange({ sizeBand: band })}
              title={SIZE_BAND_LABELS[band]}
              description={SIZE_BAND_HINTS[band]}
            />
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-weight`}>Weight in kg (optional)</Label>
        <Input
          id={`${idPrefix}-weight`}
          type="number"
          min={0}
          step="0.1"
          inputMode="decimal"
          value={values.weightKg}
          onChange={(e) => onChange({ weightKg: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-coat`}>Coat type (optional)</Label>
        <Input id={`${idPrefix}-coat`} value={values.coatType} onChange={(e) => onChange({ coatType: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-temperament`}>Anything we should know? (optional)</Label>
        <Textarea
          id={`${idPrefix}-temperament`}
          rows={2}
          value={values.temperamentNotes}
          onChange={(e) => onChange({ temperamentNotes: e.target.value })}
        />
      </div>
    </>
  );
}
