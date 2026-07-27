"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBusinessSettings } from "@/lib/actions/admin-settings";

export function BusinessSettingsForm({
  initial,
}: {
  initial: {
    businessName: string;
    contactPhone: string | null;
    contactEmail: string | null;
    depositPercentage: number;
    bufferMinutes: number;
    fullAddress: string | null;
    bookingAddress: string | null;
    serviceAreaNote: string | null;
    credentialTitle: string | null;
    credentialInstitution: string | null;
  };
}) {
  const [businessName, setBusinessName] = useState(initial.businessName);
  const [contactPhone, setContactPhone] = useState(initial.contactPhone ?? "");
  const [contactEmail, setContactEmail] = useState(initial.contactEmail ?? "");
  const [depositPercentage, setDepositPercentage] = useState(String(initial.depositPercentage));
  const [fullAddress, setFullAddress] = useState(initial.fullAddress ?? "");
  const [bookingAddress, setBookingAddress] = useState(initial.bookingAddress ?? "");
  const [serviceAreaNote, setServiceAreaNote] = useState(initial.serviceAreaNote ?? "");
  const [credentialTitle, setCredentialTitle] = useState(initial.credentialTitle ?? "");
  const [credentialInstitution, setCredentialInstitution] = useState(initial.credentialInstitution ?? "");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateBusinessSettings({
        businessName,
        contactPhone: contactPhone || undefined,
        contactEmail: contactEmail || undefined,
        depositPercentage: Number(depositPercentage),
        fullAddress: fullAddress || undefined,
        bookingAddress: bookingAddress || undefined,
        serviceAreaNote: serviceAreaNote || undefined,
        credentialTitle: credentialTitle || undefined,
        credentialInstitution: credentialInstitution || undefined,
      });
      if (result.status === "success") {
        toast.success("Settings saved");
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="space-y-1.5">
        <Label htmlFor="business-name">Business name</Label>
        <Input id="business-name" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="contact-phone">Contact phone</Label>
          <Input id="contact-phone" type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-email">Contact email</Label>
          <Input id="contact-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="deposit-pct">Deposit required (%)</Label>
        <Input
          id="deposit-pct"
          type="number"
          min="0"
          max="100"
          value={depositPercentage}
          onChange={(e) => setDepositPercentage(e.target.value)}
          className="sm:max-w-xs"
        />
        <p className="text-xs text-muted-foreground">Charged upfront when a client books, taken off the total at the end.</p>
        <p className="text-xs text-muted-foreground">Set to 0 if you don&apos;t want to take deposits — clients will book without paying anything upfront.</p>
      </div>

      <div className="border-t border-border pt-4">
        <h2 className="text-sm font-semibold">Location</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Shown on your Contact page and in the site footer.</p>
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="full-address">Your address (shown on the site)</Label>
            <Input
              id="full-address"
              value={fullAddress}
              onChange={(e) => setFullAddress(e.target.value)}
              placeholder="e.g. Hobday Place, Dunlop ACT"
            />
            <p className="text-xs text-muted-foreground">Public — keep this general (suburb only), not your exact street address.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="booking-address">Drop-off address (shown only after someone books)</Label>
            <Input
              id="booking-address"
              value={bookingAddress}
              onChange={(e) => setBookingAddress(e.target.value)}
              placeholder="e.g. 10 Hobday Place, Dunlop ACT 2615"
            />
            <p className="text-xs text-muted-foreground">
              Private — the exact address for drop-off. Shown on the booking confirmation and emailed to the customer, never on the public site.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="service-area-note">Pickup / drop-off note</Label>
            <Input
              id="service-area-note"
              value={serviceAreaNote}
              onChange={(e) => setServiceAreaNote(e.target.value)}
              placeholder="e.g. Pickups and drop-offs available for a reasonable price"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <h2 className="text-sm font-semibold">Your qualification</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Shown on your About page.</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="credential-title">Your grooming qualification</Label>
            <Input
              id="credential-title"
              value={credentialTitle}
              onChange={(e) => setCredentialTitle(e.target.value)}
              placeholder="e.g. Qualified dog groomer"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="credential-institution">Where you got it (optional)</Label>
            <Input
              id="credential-institution"
              value={credentialInstitution}
              onChange={(e) => setCredentialInstitution(e.target.value)}
              placeholder="e.g. TAFE NSW"
            />
          </div>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save settings"}
      </Button>
    </form>
  );
}
