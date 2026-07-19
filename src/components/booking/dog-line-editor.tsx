"use client";

import Image from "next/image";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SelectableCard } from "@/components/booking/selectable-card";
import { formatCents, SIZE_BAND_LABELS, SIZE_BAND_HINTS } from "@/lib/format";
import type { PetDTO, ServiceDTO, SizeBand } from "@/components/booking/types";

/** One dog line as the wizard builds it in local state. Either an existing
 * saved pet (`petId`) or a quick-added dog (`newSizeBand` + optional
 * name/breed/coat) is active, per `mode`. */
export type DogLineState = {
  id: string;
  mode: "existing" | "new";
  petId: string | null;
  newName: string;
  newBreed: string;
  newSizeBand: SizeBand;
  newCoatType: string;
  serviceId: string | null;
  addOnIds: string[];
};

export function priceRowFor(service: ServiceDTO, sizeBand: SizeBand | null) {
  if (!sizeBand) return null;
  return service.prices.find((p) => p.sizeBand === sizeBand) ?? service.prices.find((p) => p.sizeBand === null) ?? null;
}

function fromPriceCents(service: ServiceDTO): number | null {
  const priced = service.prices.filter((p) => !p.isOnInspection);
  if (!priced.length) return null;
  return Math.min(...priced.map((p) => p.priceCents));
}

export function lineSizeBand(line: DogLineState, pets: PetDTO[]): SizeBand | null {
  if (line.mode === "existing") return pets.find((p) => p.id === line.petId)?.sizeBand ?? null;
  return line.newSizeBand;
}

export function lineDogName(line: DogLineState, pets: PetDTO[]): string | null {
  if (line.mode === "existing") return pets.find((p) => p.id === line.petId)?.name ?? null;
  return line.newName.trim() || null;
}

export function lineDurationMinutes(line: DogLineState, services: ServiceDTO[], addOnServices: ServiceDTO[]): number {
  const service = services.find((s) => s.id === line.serviceId);
  if (!service) return 0;
  const addOnsTotal = line.addOnIds.reduce((sum, id) => {
    const addOn = addOnServices.find((a) => a.id === id);
    return sum + (addOn?.durationMinutes ?? 0);
  }, 0);
  return service.durationMinutes + addOnsTotal;
}

export function linePriceCents(
  line: DogLineState,
  services: ServiceDTO[],
  addOnServices: ServiceDTO[],
  pets: PetDTO[],
): { cents: number; isOnInspection: boolean } {
  const service = services.find((s) => s.id === line.serviceId);
  const sizeBand = lineSizeBand(line, pets);
  if (!service || !sizeBand) return { cents: 0, isOnInspection: false };
  const row = priceRowFor(service, sizeBand);
  const isOnInspection = row?.isOnInspection ?? false;
  const serviceCents = row && !row.isOnInspection ? row.priceCents : 0;
  const addOnsCents = line.addOnIds.reduce((sum, id) => {
    const addOn = addOnServices.find((a) => a.id === id);
    if (!addOn) return sum;
    const addOnRow = priceRowFor(addOn, sizeBand);
    return sum + (addOnRow && !addOnRow.isOnInspection ? addOnRow.priceCents : 0);
  }, 0);
  return { cents: serviceCents + addOnsCents, isOnInspection };
}

export function lineIsComplete(line: DogLineState): boolean {
  const dogChosen = line.mode === "existing" ? !!line.petId : true; // size always has a default
  return dogChosen && !!line.serviceId;
}

/** Editor for a single dog within a multi-dog booking: pick a saved dog or
 * quick-add one by size, then choose that dog's service and add-ons. */
export function DogLineEditor({
  line,
  index,
  pets,
  otherSelectedPetIds,
  services,
  addOnServices,
  pickupAddOnId,
  canRemove,
  onChange,
  onRemove,
}: {
  line: DogLineState;
  index: number;
  pets: PetDTO[];
  otherSelectedPetIds: Set<string>;
  services: ServiceDTO[];
  addOnServices: ServiceDTO[];
  pickupAddOnId: string | null;
  canRemove: boolean;
  onChange: (next: DogLineState) => void;
  onRemove: () => void;
}) {
  const availablePets = pets.filter((p) => p.id === line.petId || !otherSelectedPetIds.has(p.id));
  const sizeBand = lineSizeBand(line, pets);
  const selectedService = services.find((s) => s.id === line.serviceId) ?? null;
  const { cents: lineCents, isOnInspection } = linePriceCents(line, services, addOnServices, pets);
  const idPrefix = `dog-${line.id}`;

  function toggleAddOn(addOnId: string) {
    onChange({
      ...line,
      addOnIds: line.addOnIds.includes(addOnId) ? line.addOnIds.filter((x) => x !== addOnId) : [...line.addOnIds, addOnId],
    });
  }

  return (
    <div className="rounded-2xl border border-border p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-muted-foreground">Dog {index + 1}</p>
        {canRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </Button>
        )}
      </div>

      <div className="mt-3 space-y-5">
        {pets.length > 0 && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant={line.mode === "existing" ? "default" : "outline"}
              size="sm"
              onClick={() => onChange({ ...line, mode: "existing", petId: line.petId ?? availablePets[0]?.id ?? null })}
            >
              One of my dogs
            </Button>
            <Button type="button" variant={line.mode === "new" ? "default" : "outline"} size="sm" onClick={() => onChange({ ...line, mode: "new" })}>
              Add a new dog
            </Button>
          </div>
        )}

        {line.mode === "existing" && pets.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {availablePets.length === 0 && (
              <p className="text-sm text-muted-foreground">All your saved dogs are already in this booking.</p>
            )}
            {availablePets.map((pet) => (
              <SelectableCard
                key={pet.id}
                selected={line.petId === pet.id}
                onClick={() => onChange({ ...line, petId: pet.id })}
                title={
                  <span className="flex items-center gap-2">
                    {pet.photoUrl && (
                      <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
                        <Image src={pet.photoUrl} alt="" fill className="object-cover" sizes="32px" />
                      </span>
                    )}
                    {pet.name}
                  </span>
                }
                description={pet.breed ?? undefined}
                meta={SIZE_BAND_LABELS[pet.sizeBand]}
              />
            ))}
          </div>
        )}

        {line.mode === "new" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Size</Label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(SIZE_BAND_LABELS) as SizeBand[]).map((band) => (
                  <SelectableCard
                    key={band}
                    selected={line.newSizeBand === band}
                    onClick={() => onChange({ ...line, newSizeBand: band })}
                    title={SIZE_BAND_LABELS[band]}
                    description={SIZE_BAND_HINTS[band]}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-name`}>Dog&apos;s name (optional)</Label>
                <Input
                  id={`${idPrefix}-name`}
                  value={line.newName}
                  onChange={(e) => onChange({ ...line, newName: e.target.value })}
                  placeholder="Dog's name (optional)"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-breed`}>Breed (optional)</Label>
                <Input
                  id={`${idPrefix}-breed`}
                  value={line.newBreed}
                  onChange={(e) => onChange({ ...line, newBreed: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-coat`}>Coat type (optional)</Label>
              <Input
                id={`${idPrefix}-coat`}
                value={line.newCoatType}
                onChange={(e) => onChange({ ...line, newCoatType: e.target.value })}
                placeholder="e.g. Curly, non-shedding"
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Service</Label>
          <div className="space-y-2.5">
            {services.map((service) => {
              const from = fromPriceCents(service);
              return (
                <SelectableCard
                  key={service.id}
                  selected={line.serviceId === service.id}
                  onClick={() => onChange({ ...line, serviceId: service.id })}
                  title={service.name}
                  description={service.description}
                  meta={`${service.durationMinutes} min${from !== null ? ` · From ${formatCents(from)}` : ""}`}
                />
              );
            })}
          </div>
        </div>

        {selectedService && addOnServices.length > 0 && (
          <div className="space-y-1.5">
            <Label>Add-ons (optional)</Label>
            <div className="space-y-2.5">
              {addOnServices.map((addOn) => {
                const row = priceRowFor(addOn, sizeBand);
                const checked = line.addOnIds.includes(addOn.id);
                return (
                  <div key={addOn.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">{addOn.name}</p>
                        {addOn.description && <p className="mt-1 text-sm text-muted-foreground">{addOn.description}</p>}
                        {addOn.id === pickupAddOnId && (
                          <p className="mt-1 text-xs text-muted-foreground">We&apos;ll ask for the pickup address at checkout.</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {row && <span className="text-sm font-medium">+{formatCents(row.priceCents)}</span>}
                        <Switch checked={checked} onCheckedChange={() => toggleAddOn(addOn.id)} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {selectedService && sizeBand && (
          <p className="text-sm font-medium">
            {lineDogName(line, pets) ?? "This dog"}&apos;s total: {isOnInspection ? "Priced on inspection" : formatCents(lineCents)}
          </p>
        )}
      </div>
    </div>
  );
}
