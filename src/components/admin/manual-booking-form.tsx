"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectableCard } from "@/components/booking/selectable-card";
import { TimeSlotPicker, type ChosenSlot } from "@/components/booking/time-slot-picker";
import { formatCents, SIZE_BAND_LABELS } from "@/lib/format";
import { runAction } from "@/lib/run-action";
import { createManualBooking } from "@/lib/actions/manual-booking";

type SizeBand = "SMALL" | "MEDIUM" | "LARGE";

export type ManualServiceDTO = {
  id: string;
  name: string;
  durationMinutes: number;
  prices: { sizeBand: SizeBand | "XL" | null; priceCents: number; isOnInspection: boolean }[];
};

export type ManualClientDTO = {
  id: string;
  name: string;
  phone: string | null;
  pets: { id: string; name: string; sizeBand: SizeBand | "XL"; breed: string | null }[];
};

/** One dog being booked in this visit — its own dog choice + service selection. */
type DogLine = {
  key: string;
  mode: "existing" | "new";
  petId: string;
  newName: string;
  newBreed: string;
  newSize: SizeBand;
  serviceIds: string[];
};

let lineCounter = 0;
function blankLine(): DogLine {
  lineCounter += 1;
  return { key: `dog-${lineCounter}`, mode: "existing", petId: "", newName: "", newBreed: "", newSize: "MEDIUM", serviceIds: [] };
}

function normalizeSize(size: SizeBand | "XL"): SizeBand {
  return size === "SMALL" || size === "MEDIUM" || size === "LARGE" ? size : "LARGE";
}

function priceRowFor(service: ManualServiceDTO, sizeBand: SizeBand) {
  return service.prices.find((p) => p.sizeBand === sizeBand) ?? service.prices.find((p) => p.sizeBand === null) ?? null;
}

function fromPriceCents(service: ManualServiceDTO): number | null {
  const priced = service.prices.filter((p) => !p.isOnInspection);
  if (!priced.length) return null;
  return Math.min(...priced.map((p) => p.priceCents));
}

export function ManualBookingForm({
  clients,
  services,
  closedWeekdays,
}: {
  clients: ManualClientDTO[];
  services: ManualServiceDTO[];
  closedWeekdays: number[];
}) {
  const router = useRouter();

  const [customerMode, setCustomerMode] = useState<"existing" | "new">(clients.length > 0 ? "existing" : "new");
  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const [dogs, setDogs] = useState<DogLine[]>([blankLine()]);
  const [slot, setSlot] = useState<ChosenSlot | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;
  const clientPets = customerMode === "existing" ? (selectedClient?.pets ?? []) : [];

  // A new customer, or an existing one with no saved dogs, always enters a new dog.
  function effectiveModeFor(line: DogLine): "existing" | "new" {
    return customerMode === "new" || clientPets.length === 0 ? "new" : line.mode;
  }

  function updateLine(key: string, patch: Partial<DogLine>) {
    setDogs((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setSlot(null); // duration may change, so re-pick the time
  }
  function addDog() {
    setDogs((prev) => (prev.length >= 6 ? prev : [...prev, blankLine()]));
    setSlot(null);
  }
  function removeDog(key: string) {
    setDogs((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
    setSlot(null);
  }

  // Per-dog size, chosen services, duration and subtotal.
  function sizeForLine(line: DogLine): SizeBand {
    if (effectiveModeFor(line) === "existing") {
      const pet = clientPets.find((p) => p.id === line.petId);
      return pet ? normalizeSize(pet.sizeBand) : "MEDIUM";
    }
    return line.newSize;
  }
  function servicesForLine(line: DogLine): ManualServiceDTO[] {
    return line.serviceIds.map((id) => services.find((s) => s.id === id)).filter((s): s is ManualServiceDTO => !!s);
  }
  function lineTotals(line: DogLine): { cents: number; onInspection: boolean; duration: number } {
    const chosen = servicesForLine(line);
    const size = sizeForLine(line);
    let cents = 0;
    let onInspection = false;
    for (const s of chosen) {
      const row = priceRowFor(s, size);
      if (row?.isOnInspection) onInspection = true;
      if (row && !row.isOnInspection) cents += row.priceCents;
    }
    const duration = chosen.length ? Math.max(...chosen.map((s) => s.durationMinutes)) : 0;
    return { cents, onInspection, duration };
  }

  const grand = useMemo(() => {
    let cents = 0;
    let onInspection = false;
    let duration = 0;
    for (const line of dogs) {
      const t = lineTotals(line);
      cents += t.cents;
      onInspection = onInspection || t.onInspection;
      duration += t.duration;
    }
    return { cents, onInspection, duration: duration || 60 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dogs, clientId, customerMode]);

  const customerReady =
    customerMode === "existing" ? !!clientId : newName.trim().length > 0 && newPhone.trim().length > 0;
  const dogsReady = dogs.every((line) => {
    const modeOk = effectiveModeFor(line) === "existing" ? !!line.petId : true; // size always defaulted
    return modeOk && line.serviceIds.length > 0;
  });
  const canSubmit = customerReady && dogsReady && !!slot && !submitting;

  async function handleSubmit() {
    if (!slot) return;
    setSubmitting(true);

    const customer =
      customerMode === "existing"
        ? ({ mode: "existing", clientId } as const)
        : ({ mode: "new", name: newName.trim(), phone: newPhone.trim(), email: newEmail.trim() || undefined } as const);

    const dogsPayload = dogs.map((line) =>
      effectiveModeFor(line) === "existing"
        ? ({ dog: { mode: "existing", petId: line.petId } as const, serviceIds: line.serviceIds })
        : ({
            dog: {
              mode: "new",
              name: line.newName.trim() || undefined,
              breed: line.newBreed.trim() || undefined,
              sizeBand: line.newSize,
            } as const,
            serviceIds: line.serviceIds,
          }),
    );

    const result = await runAction(
      () => createManualBooking({ customer, dogs: dogsPayload, startAt: slot.startAt, note: note.trim() || undefined }),
      {
        success: "Booking added",
        onSuccess: (r) => {
          if (r.status === "success") router.push(`/admin/appointments/${r.appointmentId}`);
        },
      },
    );
    // Leave the button spinning on success (we're navigating away); re-enable on failure.
    if (!result || result.status === "error") setSubmitting(false);
  }

  return (
    <div className="space-y-6">
      {/* Customer */}
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="text-sm font-semibold">Customer</h2>
        {clients.length > 0 && (
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={customerMode === "existing" ? "default" : "outline"}
              onClick={() => {
                setCustomerMode("existing");
                setSlot(null);
              }}
            >
              Existing customer
            </Button>
            <Button
              type="button"
              size="sm"
              variant={customerMode === "new" ? "default" : "outline"}
              onClick={() => {
                setCustomerMode("new");
                setSlot(null);
              }}
            >
              New customer
            </Button>
          </div>
        )}

        {customerMode === "existing" ? (
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="mb-client">Choose a customer</Label>
            <select
              id="mb-client"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                // Reset dogs to a fresh single line (their pets differ).
                setDogs([blankLine()]);
                setSlot(null);
              }}
              className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mb-name">Name</Label>
              <Input id="mb-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Customer's name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mb-phone">Contact phone</Label>
              <Input id="mb-phone" type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="04XX XXX XXX" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="mb-email">Email (optional)</Label>
              <Input id="mb-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="For their confirmation email" />
              <p className="text-xs text-muted-foreground">If you add an email, we&apos;ll send them a confirmation with the drop-off address.</p>
            </div>
          </div>
        )}
      </section>

      {/* Dogs — one block per dog, each with its own services. */}
      {dogs.map((line, index) => {
        const mode = effectiveModeFor(line);
        const totals = lineTotals(line);
        return (
          <section key={line.key} className="rounded-xl border border-border bg-card p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Dog {dogs.length > 1 ? index + 1 : ""}</h2>
              {dogs.length > 1 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => removeDog(line.key)} className="text-muted-foreground">
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              )}
            </div>

            {customerMode === "existing" && clientPets.length > 0 && (
              <div className="mt-3 flex gap-2">
                <Button type="button" size="sm" variant={mode === "existing" ? "default" : "outline"} onClick={() => updateLine(line.key, { mode: "existing" })}>
                  One of their dogs
                </Button>
                <Button type="button" size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => updateLine(line.key, { mode: "new" })}>
                  Add a new dog
                </Button>
              </div>
            )}

            {mode === "existing" ? (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {clientPets.map((pet) => (
                  <SelectableCard
                    key={pet.id}
                    selected={line.petId === pet.id}
                    onClick={() => updateLine(line.key, { petId: pet.id })}
                    title={pet.name}
                    description={pet.breed ?? undefined}
                    meta={SIZE_BAND_LABELS[normalizeSize(pet.sizeBand)]}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-3 space-y-4">
                <div className="space-y-1.5">
                  <Label>Size</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["SMALL", "MEDIUM", "LARGE"] as SizeBand[]).map((band) => (
                      <SelectableCard key={band} selected={line.newSize === band} onClick={() => updateLine(line.key, { newSize: band })} title={SIZE_BAND_LABELS[band]} />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${line.key}-name`}>Dog&apos;s name (optional)</Label>
                    <Input id={`${line.key}-name`} value={line.newName} onChange={(e) => updateLine(line.key, { newName: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${line.key}-breed`}>Breed (optional)</Label>
                    <Input id={`${line.key}-breed`} value={line.newBreed} onChange={(e) => updateLine(line.key, { newBreed: e.target.value })} />
                  </div>
                </div>
              </div>
            )}

            {/* Services for THIS dog */}
            <div className="mt-5">
              <h3 className="text-sm font-semibold">Services for this dog</h3>
              <p className="text-xs text-muted-foreground">Pick one or more — done in the same visit.</p>
              <div className="mt-3 space-y-2.5">
                {services.map((service) => {
                  const from = fromPriceCents(service);
                  const selected = line.serviceIds.includes(service.id);
                  return (
                    <SelectableCard
                      key={service.id}
                      selected={selected}
                      onClick={() =>
                        updateLine(line.key, {
                          serviceIds: selected ? line.serviceIds.filter((x) => x !== service.id) : [...line.serviceIds, service.id],
                        })
                      }
                      title={service.name}
                      meta={from !== null ? `From ${formatCents(from)}` : ""}
                    />
                  );
                })}
              </div>
              {line.serviceIds.length > 0 && (
                <p className="mt-3 text-sm font-medium">
                  Subtotal: {totals.onInspection ? `${formatCents(totals.cents)} + priced on inspection` : formatCents(totals.cents)}
                </p>
              )}
            </div>
          </section>
        );
      })}

      {dogs.length < 6 && (
        <Button type="button" variant="outline" onClick={addDog} className="w-full">
          <Plus className="h-4 w-4" /> Add another dog
        </Button>
      )}

      {dogs.length > 1 && (
        <p className="text-sm font-semibold">
          Total: {grand.onInspection ? `${formatCents(grand.cents)} + priced on inspection` : formatCents(grand.cents)}
        </p>
      )}

      {/* Date & time */}
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="text-sm font-semibold">Date &amp; time</h2>
        <p className="text-xs text-muted-foreground">
          Pick a drop-off slot. {dogs.length > 1 ? "The dogs are booked back-to-back from this time. " : ""}Closed days are greyed out.
        </p>
        <div className="mt-4">
          <TimeSlotPicker durationMinutes={grand.duration} closedWeekdays={closedWeekdays} value={slot} onChange={setSlot} />
        </div>
      </section>

      {/* Note */}
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <Label htmlFor="mb-note">Note (optional)</Label>
        <Textarea id="mb-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1.5" placeholder="Anything to remember for this booking" />
      </section>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSubmit} disabled={!canSubmit} size="lg">
          {submitting ? "Adding…" : "Add booking"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/admin/calendar")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
