import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <div className="prose-none mt-6 space-y-4 text-muted-foreground">
        <p className="rounded-lg border border-dashed border-border bg-muted/50 p-4 text-sm">
          <strong className="text-foreground">Placeholder — not yet legally reviewed.</strong> This
          page is a starting skeleton because the site collects client and pet details and
          processes payments. Please have this reviewed (a solicitor or a service like an
          online privacy-policy generator tailored to Australian Privacy Act requirements)
          before relying on it, and before taking real payments.
        </p>
        <p>
          Trims and Bubbles collects the personal information you provide when booking an
          appointment or creating a client account — including your name, contact details,
          and information about your dog (breed, size, temperament notes) — in order to
          provide grooming services, manage bookings, and process payments.
        </p>
        <p>
          Photos of your dog taken during grooming appointments are stored in your client
          account so you can view your dog&apos;s grooming history. With your permission,
          selected photos may be featured in our public gallery.
        </p>
        <p>
          Payment processing is handled by Stripe; we do not store your full card details
          ourselves. See Stripe&apos;s own privacy policy for how they handle payment data.
        </p>
        <p>
          To request a copy of your data, or to have your account and data deleted, contact us
          using the details on our Contact page.
        </p>
      </div>
    </div>
  );
}
