import { Phone, Mail } from "lucide-react";
import { getBusinessDetails } from "@/lib/business-data";
import { cn } from "@/lib/utils";

/**
 * Friendly "stuck? call or email us" panel with the business's real phone and
 * email. Dropped onto the booking and checkout flows so a customer who hits any
 * snag has an immediate, human way to reach the owner (she's happy to take a
 * booking or order over the phone). Server component — reads the live,
 * owner-editable contact details.
 */
export async function NeedHelp({ className }: { className?: string }) {
  const business = await getBusinessDetails();
  const telHref = `tel:${business.contactPhone.replace(/[^\d+]/g, "")}`;

  return (
    <div className={cn("rounded-xl border border-border bg-muted/30 p-4 sm:p-5", className)}>
      <p className="text-sm font-semibold">Need a hand, or something not working?</p>
      <p className="mt-1 text-sm text-muted-foreground text-pretty">
        Give us a call or send an email and we&apos;ll sort it out straight away — we&apos;re also happy to take
        your booking or order over the phone.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
        <a
          href={telHref}
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
        >
          <Phone className="h-4 w-4 shrink-0 text-primary" /> {business.contactPhone}
        </a>
        <a
          href={`mailto:${business.contactEmail}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary"
        >
          <Mail className="h-4 w-4 shrink-0 text-primary" /> {business.contactEmail}
        </a>
      </div>
    </div>
  );
}
