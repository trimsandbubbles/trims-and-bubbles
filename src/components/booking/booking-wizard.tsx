"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InlineAuth } from "@/components/booking/inline-auth";
import { TimeSlotPicker, type ChosenSlot } from "@/components/booking/time-slot-picker";
import {
  DogLineEditor,
  lineDogName,
  lineDurationMinutes,
  lineIsComplete,
  linePriceCents,
  lineSizeBand,
  type DogLineState,
} from "@/components/booking/dog-line-editor";
import { getMyPets } from "@/lib/actions/client-profile";
import { createBooking } from "@/lib/actions/booking";
import { formatCents, SIZE_BAND_LABELS } from "@/lib/format";
import type { BookingDogLine, PetDTO, ServiceDTO } from "@/components/booking/types";

type Step = "dogs" | "datetime" | "auth" | "confirm";

const STEP_LABELS: Record<Step, string> = {
  dogs: "Your dogs",
  datetime: "Date & time",
  auth: "Sign in",
  confirm: "Confirm",
};

const MAX_DOGS = 6;

const WHEN_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
});
const SHORT_WHEN_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "short",
  day: "numeric",
  month: "short",
});
const TIME_FMT = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" });

function createDogLine(id: string, pets: PetDTO[], usedPetIds: Set<string>): DogLineState {
  const available = pets.filter((p) => !usedPetIds.has(p.id));
  return {
    id,
    mode: available.length > 0 ? "existing" : "new",
    petId: available[0]?.id ?? null,
    newName: "",
    newBreed: "",
    newSizeBand: "MEDIUM",
    newCoatType: "",
    serviceId: null,
    addOnIds: [],
  };
}

export function BookingWizard({
  services,
  addOnServices,
  initialSession,
  initialPets,
  closedWeekdays,
}: {
  services: ServiceDTO[];
  addOnServices: ServiceDTO[];
  initialSession: { name: string; email: string; phone: string | null } | null;
  initialPets: PetDTO[];
  closedWeekdays: number[];
}) {
  const [step, setStep] = useState<Step>("dogs");
  const [hasSession, setHasSession] = useState(!!initialSession);
  const [pets, setPets] = useState<PetDTO[]>(initialPets);

  const nextDogIdRef = useRef(1); // "dog-0" is used for the line created below.
  const [dogLines, setDogLines] = useState<DogLineState[]>(() => [createDogLine("dog-0", initialPets, new Set())]);

  const [pickupAddress, setPickupAddress] = useState("");
  const [slot, setSlot] = useState<ChosenSlot | null>(null);

  const [phone, setPhone] = useState(initialSession?.phone ?? "");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<{ appointmentIds: string[] } | null>(null);

  const pickupAddOnId = addOnServices.find((a) => a.slug === "pickup-and-dropoff")?.id ?? null;
  const wantsPickup = pickupAddOnId ? dogLines.some((l) => l.addOnIds.includes(pickupAddOnId)) : false;

  const lineResults = dogLines.map((line) => ({
    line,
    ...linePriceCents(line, services, addOnServices, pets),
    durationMinutes: lineDurationMinutes(line, services, addOnServices),
  }));
  const totalDurationMinutes = lineResults.reduce((sum, r) => sum + r.durationMinutes, 0);
  const totalCents = lineResults.reduce((sum, r) => sum + r.cents, 0);
  const anyOnInspection = lineResults.some((r) => r.isOnInspection);

  const allLinesComplete = dogLines.every(lineIsComplete);
  const canContinueDogs = allLinesComplete && (!wantsPickup || pickupAddress.trim().length > 0);

  function addDogLine() {
    setDogLines((prev) => {
      if (prev.length >= MAX_DOGS) return prev;
      const used = new Set(prev.filter((l) => l.mode === "existing" && l.petId).map((l) => l.petId as string));
      const id = `dog-${nextDogIdRef.current++}`;
      return [...prev, createDogLine(id, pets, used)];
    });
  }
  function removeDogLine(id: string) {
    setDogLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
  }
  function updateDogLine(id: string, next: DogLineState) {
    setDogLines((prev) => prev.map((l) => (l.id === id ? next : l)));
  }

  function goNext() {
    if (step === "dogs") setStep("datetime");
    else if (step === "datetime") setStep(hasSession ? "confirm" : "auth");
  }
  function goBack() {
    if (step === "datetime") setStep("dogs");
    else if (step === "auth") setStep("datetime");
    else if (step === "confirm") setStep(hasSession ? "datetime" : "auth");
  }

  async function handleAuthenticated(_name: string, phoneFromSignup?: string) {
    setHasSession(true);
    if (phoneFromSignup) setPhone(phoneFromSignup);
    const freshPets = await getMyPets();
    setPets(freshPets);
    setStep("confirm");
  }

  async function handleSubmit() {
    if (!slot || !allLinesComplete) return;
    setSubmitting(true);
    setSubmitError(null);

    const dogs: BookingDogLine[] = dogLines.map((line) => {
      if (line.mode === "existing" && line.petId) {
        return { petId: line.petId, serviceId: line.serviceId!, addOnServiceIds: line.addOnIds };
      }
      return {
        newDog: {
          name: line.newName.trim() || undefined,
          breed: line.newBreed.trim() || undefined,
          sizeBand: line.newSizeBand,
          coatType: line.newCoatType.trim() || undefined,
        },
        serviceId: line.serviceId!,
        addOnServiceIds: line.addOnIds,
      };
    });

    const result = await createBooking({
      startAt: slot.startAt,
      phone: phone.trim(),
      notesFromClient: notes.trim() || undefined,
      pickupRequested: wantsPickup,
      pickupAddress: wantsPickup ? pickupAddress.trim() || undefined : undefined,
      dogs,
    });

    if (result.status === "success") {
      setSubmitting(false);
      setBookingResult({ appointmentIds: result.appointmentIds });
    } else {
      setSubmitting(false);
      setSubmitError(result.message);
    }
  }

  if (bookingResult) {
    const dogCount = bookingResult.appointmentIds.length;
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center sm:px-6">
        <CheckCircle2 className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">You&apos;re booked in!</h1>
        <p className="mt-2 text-muted-foreground text-pretty">
          {dogCount === 1 ? "Your dog is" : `All ${dogCount} dogs are`} confirmed for{" "}
          {slot && WHEN_FMT.format(new Date(slot.startAt))}.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button render={<Link href="/portal/appointments" />}>View my appointments</Button>
          <Button variant="outline" render={<Link href="/portal" />}>
            Go to my account
          </Button>
        </div>
      </div>
    );
  }

  const finishAt = slot ? new Date(new Date(slot.startAt).getTime() + totalDurationMinutes * 60_000) : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Book an appointment</h1>

      {/* Step indicator */}
      <div className="mt-4 flex flex-wrap gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        {(Object.keys(STEP_LABELS) as Step[])
          .filter((s) => !(hasSession && s === "auth"))
          .map((s, i, arr) => (
            <span key={s} className={s === step ? "font-semibold text-foreground" : ""}>
              {STEP_LABELS[s]}
              {i < arr.length - 1 ? " · " : ""}
            </span>
          ))}
      </div>

      {/* Running summary */}
      <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm">
        <span className="font-medium">
          {dogLines.length} {dogLines.length === 1 ? "dog" : "dogs"}
        </span>
        {totalDurationMinutes > 0 && <span> · {totalDurationMinutes} min</span>}
        {slot && (
          <span>
            {" · "}
            {SHORT_WHEN_FMT.format(new Date(slot.startAt))} {TIME_FMT.format(new Date(slot.startAt))}
          </span>
        )}
        {allLinesComplete && (
          <span className="ml-2 font-medium">
            {anyOnInspection ? `${formatCents(totalCents)} + priced on inspection` : formatCents(totalCents)}
          </span>
        )}
      </div>

      <div className="mt-6">
        {step === "dogs" && (
          <div className="space-y-4">
            {dogLines.map((line, i) => (
              <DogLineEditor
                key={line.id}
                line={line}
                index={i}
                pets={pets}
                otherSelectedPetIds={
                  new Set(
                    dogLines
                      .filter((l) => l.id !== line.id && l.mode === "existing" && l.petId)
                      .map((l) => l.petId as string),
                  )
                }
                services={services}
                addOnServices={addOnServices}
                pickupAddOnId={pickupAddOnId}
                canRemove={dogLines.length > 1}
                onChange={(next) => updateDogLine(line.id, next)}
                onRemove={() => removeDogLine(line.id)}
              />
            ))}

            {dogLines.length < MAX_DOGS && (
              <Button type="button" variant="outline" className="w-full" onClick={addDogLine}>
                + Add another dog
              </Button>
            )}

            {wantsPickup && (
              <div className="space-y-1.5">
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
        )}

        {step === "datetime" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We book one back-to-back slot for {dogLines.length === 1 ? "your dog" : `all ${dogLines.length} dogs`} —
              about {totalDurationMinutes} minutes in total.
            </p>
            <TimeSlotPicker
              durationMinutes={totalDurationMinutes}
              closedWeekdays={closedWeekdays}
              value={slot}
              onChange={setSlot}
            />
            {finishAt && (
              <p className="text-sm text-muted-foreground">Estimated finish: {TIME_FMT.format(finishAt)}</p>
            )}
          </div>
        )}

        {step === "auth" && <InlineAuth onAuthenticated={handleAuthenticated} />}

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
              <dl className="mt-2 space-y-2 text-muted-foreground">
                {lineResults.map(({ line, cents, isOnInspection }) => {
                  const sizeBand = lineSizeBand(line, pets);
                  const service = services.find((s) => s.id === line.serviceId);
                  const addOnNames = addOnServices.filter((a) => line.addOnIds.includes(a.id)).map((a) => a.name);
                  return (
                    <div key={line.id} className="flex justify-between gap-3">
                      <dt>
                        {lineDogName(line, pets) ?? "Dog"} ({sizeBand ? SIZE_BAND_LABELS[sizeBand] : "—"})
                        <br />
                        <span className="text-xs">
                          {service?.name}
                          {addOnNames.length > 0 ? ` + ${addOnNames.join(", ")}` : ""}
                        </span>
                      </dt>
                      <dd className="shrink-0">{isOnInspection ? "On inspection" : formatCents(cents)}</dd>
                    </div>
                  );
                })}
                {slot && (
                  <div className="flex justify-between border-t border-border pt-1.5">
                    <dt>When</dt>
                    <dd>
                      {SHORT_WHEN_FMT.format(new Date(slot.startAt))} {TIME_FMT.format(new Date(slot.startAt))}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-1.5 font-medium text-foreground">
                  <dt>Total</dt>
                  <dd>{anyOnInspection ? `${formatCents(totalCents)} + priced on inspection` : formatCents(totalCents)}</dd>
                </div>
              </dl>
              <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
                Payment is <span className="font-medium text-foreground">cash on the day</span> of your appointment
                — no online payment needed to book.
              </p>
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
        {step !== "dogs" ? (
          <Button type="button" variant="ghost" onClick={goBack}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
        ) : (
          <span />
        )}

        {step === "dogs" && (
          <Button type="button" disabled={!canContinueDogs} onClick={goNext}>
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
            {submitting ? "Booking..." : "Confirm booking"}
          </Button>
        )}
      </div>
    </div>
  );
}
