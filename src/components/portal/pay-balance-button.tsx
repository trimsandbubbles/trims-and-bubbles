"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createBalanceCheckoutSession } from "@/lib/actions/payments";
import { formatCents } from "@/lib/format";

export function PayBalanceButton({ appointmentId, balanceOwingCents }: { appointmentId: string; balanceOwingCents: number }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await createBalanceCheckoutSession(appointmentId);
      if (result.status === "success") {
        window.location.assign(result.checkoutUrl);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Button onClick={handleClick} disabled={pending}>
      <CreditCard className="h-4 w-4" /> {pending ? "Redirecting to checkout..." : `Pay ${formatCents(balanceOwingCents)} now`}
    </Button>
  );
}
