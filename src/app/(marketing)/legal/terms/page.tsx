import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <div className="prose-none mt-6 space-y-4 text-muted-foreground">
        <p className="rounded-lg border border-dashed border-border bg-muted/50 p-4 text-sm">
          <strong className="text-foreground">Placeholder — not yet legally reviewed.</strong> Please
          have these terms reviewed before relying on them.
        </p>
        <p>
          A deposit (a set percentage of the service price, shown at checkout) is required to
          confirm your booking, with the remaining balance due on completion of the groom.
          Deposits are non-refundable for cancellations made with less than 24 hours&apos; notice.
        </p>
        <p>
          We reserve the right to decline or stop a service, or to apply an adjusted price, if a
          dog&apos;s coat condition (e.g. severe matting), temperament, or health needs mean the
          original service can&apos;t safely or reasonably be completed as booked. We&apos;ll
          always discuss this with you first where possible.
        </p>
        <p>
          Dogs with an active flea or tick infestation may be declined on the day for the safety
          of other animals and staff.
        </p>
        <p>
          By booking, you confirm your dog is up to date with routine vaccinations and free from
          any contagious condition.
        </p>
      </div>
    </div>
  );
}
