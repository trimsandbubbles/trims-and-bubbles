"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AlertCircle, CheckCircle2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SelectableCard } from "@/components/booking/selectable-card";
import { InlineAuth } from "@/components/booking/inline-auth";
import { TimeSlotPicker, type ChosenSlot } from "@/components/booking/time-slot-picker";
import { getMyPets } from "@/lib/actions/client-profile";
import { createBooking } from "@/lib/actions/booking";
import { formatCents, SIZE_BAND_LABELS, SIZE_BAND_HINTS } from "@/lib/format";
import type { PetDTO, ServiceDTO, SizeBand } from "@/components/booking/types";

type Step = "service" | "auth" | "dog" | "addons" | "datetime" | "confirm";

const STEP_LABELS: Record<Step, string> = {
  service: "Service",
  auth: "Your account",
  dog: "Your dog",
  addons: "Add-ons",
  datetime: "Date & time",
  confirm: "Confirm",
};

function priceRowFor(service: ServiceDTO, sizeBand: SizeBand | null) {
  if (!sizeBand) return null;
  return service.prices.find((p) => p.sizeBand === sizeBand) ?? service.prices.find((p) => p.sizeBand === null) ?? null;
}

function fromPriceCents(service: ServiceDTO): number | null {
  const priced = service.prices.filter((p) => !p.isOnInspection);
  if (!priced.length) return null;
  return Math.min(...priced.map((p) => p.priceCents));
}

export function BookingWizard({
  services,
  addOnServices,
  initialSession,
  initialPets,
  closedWeekdays,
  stripeEnabled,
  checkoutCancelled,
}: {
  services: ServiceDTO[];
  addOnServices: ServiceDTO[];
  initialSession: { name: string; phone: string | null } | null;
  initialPets: PetDTO[];
  closedWeekdays: number[];
  stripeEnabled: boolean;
  checkoutCancelled?: boolean;
}) {
  const [step, setStep] = useState<Step>("service");
  const [hasSession, setHasSession] = useState(!!initialSession);
  const [pets, setPets] = useState<PetDTO[]>(initialPets);

  const [serviceId, setServiceId] = useState<string | null>(null);
  const [petMode, setPetMode] = useState<"existing" | "new">(initialPets.length > 0 ? "existing" : "new");
  const [selectedPetId, setSelectedPetId] = useState<string | null>(initialPets[0]?.id ?? null);
  const [newPetName, setNewPetName] = useState("");
  const [newPetBreed, setNewPetBreed] = useState("");
  const [newPetSizeBand, setNewPetSizeBand] = useState<SizeBand>("MEDIUM");
  const [newPetCoatType, setNewPetCoatType] = useState("");
  const [newPetTemperament, setNewPetTemperament] = useState("");

  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [pickupAddress, setPickupAddress] = useState("");

  const [slot, setSlot] = useState<ChosenSlot | null>(null);

  const [phone, setPhone] = useState(initialSession?.phone ?? "");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bookedAppointmentId, setBookedAppointmentId] = useState<string | null>(null);

  const hasAddOns = addOnServices.length > 0;

  const selectedService = services.find((s) => s.id === serviceId) ?? null;
  const pickupAddOn = addOnServices.find((a) => a.slug === "pickup-and-dropoff") ?? null;
  const wantsPickup = pickupAddOn ? addOnIds.includes(pickupAddOn.id) : false;

  const currentSizeBand: SizeBand | null =
    petMode === "existing" ? (pets.find((p) => p.id === selectedPetId)?.sizeBand ?? null) : newPetSizeBand;
  const currentPetName =
    petMode === "existing" ? (pets.find((p) => p.id === selectedPetId)?.name ?? null) : newPetName || null;

  const servicePriceRow = selectedService ? priceRowFor(selectedService, currentSizeBand) : null;
  const addOnTotalCents = addOnIds.reduce((sum, id) => {
    const addOn = addOnServices.find((a) => a.id === id);
    if (!addOn) return sum;
    const row = priceRowFor(addOn, currentSizeBand);
    return sum + (row?.priceCents ?? 0);
  }, 0);
  const totalCents = (servicePriceRow && !servicePriceRow.isOnInspection ? servicePriceRow.priceCents : 0) + addOnTotalCents;
  const isOnInspection = servicePriceRow?.isOnInspection ?? false;

  function goNext() {
    if (step === "service") setStep(hasSession ? "dog" : "auth");
    else if (step === "dog") setStep(hasAddOns ? "addons" : "datetime");
    else if (step === "addons") setStep("datetime");
    else if (step === "datetime") setStep("confirm");
  }
  function goBack() {
    if (step === "dog") setStep(hasSession ? "service" : "auth");
    else if (step === "addons") setStep("dog");
    else if (step === "datetime") setStep(hasAddOns ? "addons" : "dog");
    else if (step === "confirm") setStep("datetime");
    else if (step === "auth") setStep("service");
  }

  async function handleAuthenticated(_name: string, phoneFromSignup?: string) {
    setHasSession(true);
    if (phoneFromSignup) setPhone(phoneFromSignup);
    const freshPets = await getMyPets();
    setPets(freshPets);
    setPetMode(freshPets.length > 0 ? "existing" : "new");
    setSelectedPetId(freshPets[0]?.id ?? null);
    setStep("dog");
  }

  function toggleAddOn(id: string) {
    setAddOnIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const canContinueDog = petMode === "existing" ? !!selectedPetId : newPetName.trim().length > 0;
  const canContinueAddOns = !wantsPickup || pickupAddress.trim().length > 0;

  async function handleSubmit() {
    if (!selectedService || !slot) return;
    setSubmitting(true);
    setSubmitError(null);

    const result = await createBooking({
      serviceId: selectedService.id,
      addOnServiceIds: addOnIds,
      startAt: slot.startAt,
      petId: petMode === "existing" ? (selectedPetId ?? undefined) : undefined,
      newPet:
        petMode === "new"
          ? {
              name: newPetName.trim(),
              breed: newPetBreed.trim() || undefined,
              sizeBand: newPetSizeBand,
              coatType: newPetCoatType.trim() || undefined,
              temperamentNotes: newPetTemperament.trim() || undefined,
            }
          : undefined,
      phone: phone.trim(),
      notesFromClient: notes.trim() || undefined,
      pickupRequested: wantsPickup,
      pickupAddress: wantsPickup ? pickupAddress.trim() || undefined : undefined,
    });

    if (result.status === "success") {
      if (result.checkoutUrl) {
        // Leave `submitting` true — the page is about to navigate away to
        // Stripe Checkout, so keep the button in its "working" state rather
        // than flashing back to idle. location.assign(), not `.href =`, so
        // the react-hooks/immutability rule doesn't read this as mutating a
        // variable (it's a method call, not a property assignment).
        window.location.assign(result.checkoutUrl);
        return;
      }
      setSubmitting(false);
      setBookedAppointmentId(result.appointmentId);
    } else {
      setSubmitting(false);
      setSubmitError(result.message);
    }
  }

  if (bookedAppointmentId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center sm:px-6">
        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">You&apos;re booked in!</h1>
        <p className="mt-2 text-muted-foreground text-pretty">
          {currentPetName ? `${currentPetName}'s` : "Your dog's"} {selectedService?.name.toLowerCase()} is confirmed for{" "}
          {slot &&
            new Intl.DateTimeFormat("en-AU", {
              timeZone: "Australia/Sydney",
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(slot.startAt))}
          .
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button render={<Link href={`/portal/appointments/${bookedAppointmentId}`} />}>View appointment</Button>
          <Button variant="outline" render={<Link href="/portal" />}>
            Go to my account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Book an appointment</h1>

      {checkoutCancelled && (
        <Alert className="mt-4">
          <AlertCircle />
          <AlertDescription>Checkout was cancelled — no charge was made. Pick up where you left off below.</AlertDescription>
        </Alert>
      )}

      {/* Step indicator */}
      <div className="mt-4 flex flex-wrap gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        {(Object.keys(STEP_LABELS) as Step[])
          .filter((s) => !(hasSession && s === "auth"))
          .filter((s) => !(!hasAddOns && s === "addons"))
          .map((s, i, arr) => (
            <span key={s} className={s === step ? "font-semibold text-foreground" : ""}>
              {STEP_LABELS[s]}
              {i < arr.length - 1 ? " · " : ""}
            </span>
          ))}
      </div>

      {/* Running summary once a service is chosen */}
      {selectedService && (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <span className="font-medium">{selectedService.name}</span>
          {currentPetName && <span> · {currentPetName}</span>}
          {slot && (
            <span>
              {" · "}
              {new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short" }).format(
                new Date(slot.startAt),
              )}{" "}
              {new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" }).format(
                new Date(slot.startAt),
              )}
            </span>
          )}
          {currentSizeBand && (
            <span className="ml-2 font-medium">{isOnInspection ? "Priced on inspection" : formatCents(totalCents)}</span>
          )}
        </div>
      )}

      <div className="mt-6">
        {step === "service" && (
          <div className="space-y-3">
            {services.map((service) => {
              const from = fromPriceCents(service);
              return (
                <SelectableCard
                  key={service.id}
                  selected={serviceId === service.id}
                  onClick={() => setServiceId(service.id)}
                  title={service.name}
                  description={service.description}
                  meta={`${service.durationMinutes} min${from !== null ? ` · From ${formatCents(from)}` : ""}`}
                />
              );
            })}
          </div>
        )}

        {step === "auth" && <InlineAuth onAuthenticated={handleAuthenticated} />}

        {step === "dog" && (
          <div className="space-y-5">
            {pets.length > 0 && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={petMode === "existing" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPetMode("existing")}
                >
                  One of my dogs
                </Button>
                <Button type="button" variant={petMode === "new" ? "default" : "outline"} size="sm" onClick={() => setPetMode("new")}>
                  Add a new dog
                </Button>
              </div>
            )}

            {petMode === "existing" && pets.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {pets.map((pet) => (
                  <SelectableCard
                    key={pet.id}
                    selected={selectedPetId === pet.id}
                    onClick={() => setSelectedPetId(pet.id)}
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

            {petMode === "new" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pet-name">Dog&apos;s name</Label>
                  <Input id="pet-name" value={newPetName} onChange={(e) => setNewPetName(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pet-breed">Breed (optional)</Label>
                  <Input id="pet-breed" value={newPetBreed} onChange={(e) => setNewPetBreed(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Size</Label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(Object.keys(SIZE_BAND_LABELS) as SizeBand[]).map((band) => (
                      <SelectableCard
                        key={band}
                        selected={newPetSizeBand === band}
                        onClick={() => setNewPetSizeBand(band)}
                        title={SIZE_BAND_LABELS[band]}
                        description={SIZE_BAND_HINTS[band]}
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pet-coat">Coat type (optional)</Label>
                  <Input id="pet-coat" value={newPetCoatType} onChange={(e) => setNewPetCoatType(e.target.value)} placeholder="e.g. Curly, non-shedding" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pet-temperament">Anything we should know? (optional)</Label>
                  <Textarea
                    id="pet-temperament"
                    value={newPetTemperament}
                    onChange={(e) => setNewPetTemperament(e.target.value)}
                    placeholder="Nervous around clippers, sensitive paws, etc."
                    rows={3}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {step === "addons" && (
          <div className="space-y-4">
            {addOnServices.length === 0 && <p className="text-sm text-muted-foreground">No add-ons available right now.</p>}
            {addOnServices.map((addOn) => {
              const row = priceRowFor(addOn, currentSizeBand);
              const checked = addOnIds.includes(addOn.id);
              return (
                <div key={addOn.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{addOn.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{addOn.description}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {row && <span className="text-sm font-medium">+{formatCents(row.priceCents)}</span>}
                      <Switch checked={checked} onCheckedChange={() => toggleAddOn(addOn.id)} />
                    </div>
                  </div>
                  {addOn.slug === "pickup-and-dropoff" && checked && (
                    <div className="mt-3 space-y-1.5">
                      <Label htmlFor="pickup-address">Pickup &amp; drop-off address</Label>
                      <Input
                        id="pickup-address"
                        value={pickupAddress}
                        onChange={(e) => setPickupAddress(e.target.value)}
                        placeholder="Street address"
                        required
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {step === "datetime" && selectedService && (
          <TimeSlotPicker
            serviceId={selectedService.id}
            addOnIds={addOnIds}
            closedWeekdays={closedWeekdays}
            value={slot}
            onChange={setSlot}
          />
        )}

        {step === "confirm" && (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="contact-phone">Contact phone</Label>
              <Input id="contact-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="booking-notes">Anything else we should know? (optional)</Label>
              <Textarea id="booking-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
              <p className="font-medium">Summary</p>
              <dl className="mt-2 space-y-1 text-muted-foreground">
                <div className="flex justify-between">
                  <dt>Service</dt>
                  <dd>{selectedService?.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Dog</dt>
                  <dd>
                    {currentPetName} ({currentSizeBand ? SIZE_BAND_LABELS[currentSizeBand] : "—"})
                  </dd>
                </div>
                {addOnIds.length > 0 && (
                  <div className="flex justify-between">
                    <dt>Add-ons</dt>
                    <dd>{addOnServices.filter((a) => addOnIds.includes(a.id)).map((a) => a.name).join(", ")}</dd>
                  </div>
                )}
                {slot && (
                  <div className="flex justify-between">
                    <dt>When</dt>
                    <dd>
                      {new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(
                        new Date(slot.startAt),
                      )}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-1.5 font-medium text-foreground">
                  <dt>Total</dt>
                  <dd>{isOnInspection ? "Priced on inspection" : formatCents(totalCents)}</dd>
                </div>
              </dl>
              {!stripeEnabled && (
                <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
                  Payment is <span className="font-medium text-foreground">cash on the day</span> of your
                  appointment — no online payment needed to book.
                </p>
              )}
            </div>

            {submitError && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between">
        {step !== "service" ? (
          <Button type="button" variant="ghost" onClick={goBack}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
        ) : (
          <span />
        )}

        {step === "service" && (
          <Button type="button" disabled={!serviceId} onClick={goNext}>
            Continue
          </Button>
        )}
        {step === "dog" && (
          <Button type="button" disabled={!canContinueDog} onClick={goNext}>
            Continue
          </Button>
        )}
        {step === "addons" && (
          <Button type="button" disabled={!canContinueAddOns} onClick={goNext}>
            Continue
          </Button>
        )}
        {step === "datetime" && (
          <Button type="button" disabled={!slot} onClick={goNext}>
            Continue
          </Button>
        )}
        {step === "confirm" && (
          <Button type="button" disabled={submitting || !phone.trim()} onClick={handleSubmit}>
            {submitting
              ? "Booking..."
              : !isOnInspection && stripeEnabled
                ? "Confirm & pay deposit"
                : "Confirm booking"}
          </Button>
        )}
      </div>
    </div>
  );
}
