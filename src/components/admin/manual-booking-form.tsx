"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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

  const [dogMode, setDogMode] = useState<"existing" | "new">("existing");
  const [petId, setPetId] = useState<string>("");
  const [newDogName, setNewDogName] = useState("");
  const [newDogBreed, setNewDogBreed] = useState("");
  const [newDogSize, setNewDogSize] = useState<SizeBand>("MEDIUM");

  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [slot, setSlot] = useState<ChosenSlot | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;
  const clientPets = customerMode === "existing" ? (selectedClient?.pets ?? []) : [];
  // A new customer, or an existing one with no saved dogs, always enters a new dog.
  const effectiveDogMode: "existing" | "new" = customerMode === "new" || clientPets.length === 0 ? "new" : dogMode;

  const selectedPet = clientPets.find((p) => p.id === petId) ?? null;
  const sizeBand: SizeBand = effectiveDogMode === "existing" ? (selectedPet ? normalizeSize(selectedPet.sizeBand) : "MEDIUM") : newDogSize;

  const chosenServices = useMemo(
    () => serviceIds.map((id) => services.find((s) => s.id === id)).filter((s): s is ManualServiceDTO => !!s),
    [serviceIds, services],
  );
  const durationMinutes = chosenServices.length ? Math.max(...chosenServices.map((s) => s.durationMinutes)) : 60;

  const { totalCents, anyOnInspection } = useMemo(() => {
    let total = 0;
    let onInspection = false;
    for (const s of chosenServices) {
      const row = priceRowFor(s, sizeBand);
      if (row?.isOnInspection) onInspection = true;
      if (row && !row.isOnInspection) total += row.priceCents;
    }
    return { totalCents: total, anyOnInspection: onInspection };
  }, [chosenServices, sizeBand]);

  function toggleService(id: string) {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setSlot(null); // duration may change, so re-pick the time
  }

  const customerReady =
    customerMode === "existing" ? !!clientId : newName.trim().length > 0 && newPhone.trim().length > 0;
  const dogReady = effectiveDogMode === "existing" ? !!petId : true; // size always defaulted
  const canSubmit = customerReady && dogReady && serviceIds.length > 0 && !!slot && !submitting;

  async function handleSubmit() {
    if (!slot) return;
    setSubmitting(true);

    const customer =
      customerMode === "existing"
        ? ({ mode: "existing", clientId } as const)
        : ({ mode: "new", name: newName.trim(), phone: newPhone.trim(), email: newEmail.trim() || undefined } as const);

    const dog =
      effectiveDogMode === "existing"
        ? ({ mode: "existing", petId } as const)
        : ({
            mode: "new",
            name: newDogName.trim() || undefined,
            breed: newDogBreed.trim() || undefined,
            sizeBand: newDogSize,
          } as const);

    const result = await runAction(
      () => createManualBooking({ customer, dog, serviceIds, startAt: slot.startAt, note: note.trim() || undefined }),
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
              onClick={() => setCustomerMode("existing")}
            >
              Existing customer
            </Button>
            <Button
              type="button"
              size="sm"
              variant={customerMode === "new" ? "default" : "outline"}
              onClick={() => setCustomerMode("new")}
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
                setPetId("");
                setDogMode("existing");
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

      {/* Dog */}
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="text-sm font-semibold">Dog</h2>
        {customerMode === "existing" && clientPets.length > 0 && (
          <div className="mt-3 flex gap-2">
            <Button type="button" size="sm" variant={effectiveDogMode === "existing" ? "default" : "outline"} onClick={() => setDogMode("existing")}>
              One of their dogs
            </Button>
            <Button type="button" size="sm" variant={effectiveDogMode === "new" ? "default" : "outline"} onClick={() => setDogMode("new")}>
              Add a new dog
            </Button>
          </div>
        )}

        {effectiveDogMode === "existing" ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {clientPets.map((pet) => (
              <SelectableCard
                key={pet.id}
                selected={petId === pet.id}
                onClick={() => setPetId(pet.id)}
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
                  <SelectableCard key={band} selected={newDogSize === band} onClick={() => setNewDogSize(band)} title={SIZE_BAND_LABELS[band]} />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="mb-dog-name">Dog&apos;s name (optional)</Label>
                <Input id="mb-dog-name" value={newDogName} onChange={(e) => setNewDogName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mb-dog-breed">Breed (optional)</Label>
                <Input id="mb-dog-breed" value={newDogBreed} onChange={(e) => setNewDogBreed(e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Services */}
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="text-sm font-semibold">Services</h2>
        <p className="text-xs text-muted-foreground">Pick one or more — they&apos;re done in the same visit.</p>
        <div className="mt-3 space-y-2.5">
          {services.map((service) => {
            const from = fromPriceCents(service);
            return (
              <SelectableCard
                key={service.id}
                selected={serviceIds.includes(service.id)}
                onClick={() => toggleService(service.id)}
                title={service.name}
                meta={from !== null ? `From ${formatCents(from)}` : ""}
              />
            );
          })}
        </div>
        {serviceIds.length > 0 && (
          <p className="mt-3 text-sm font-medium">
            Total: {anyOnInspection ? `${formatCents(totalCents)} + priced on inspection` : formatCents(totalCents)}
          </p>
        )}
      </section>

      {/* Date & time */}
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="text-sm font-semibold">Date &amp; time</h2>
        <p className="text-xs text-muted-foreground">Pick a drop-off slot. Closed days are greyed out.</p>
        <div className="mt-4">
          <TimeSlotPicker durationMinutes={durationMinutes} closedWeekdays={closedWeekdays} value={slot} onChange={setSlot} />
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
