"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markPaymentPaidManually, refundPayment } from "@/lib/actions/admin-payments";
import { formatCents } from "@/lib/format";

/** Shared row-level actions for a single payment — used on both the
 * appointment detail page and the global /admin/payments list.
 *
 * `isOwner` gates the money-moving controls (mark-paid / refund): the server
 * actions already enforce owner-only via requireOwner(), so this just avoids
 * showing staff a button that would only error. */
export function PaymentRowActions({
  paymentId,
  status,
  amountCents,
  isOwner = false,
}: {
  paymentId: string;
  status: string;
  amountCents: number;
  isOwner?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleMarkPaid() {
    startTransition(async () => {
      const result = await markPaymentPaidManually(paymentId);
      if (result.status === "success") {
        toast.success("Marked as paid");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleRefund() {
    if (!window.confirm(`Refund ${formatCents(amountCents)}?`)) return;
    startTransition(async () => {
      const result = await refundPayment({ paymentId });
      if (result.status === "success") {
        toast.success("Refund recorded");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  // Only the owner can move money (record cash / refund).
  if (!isOwner) return null;

  if (status === "PENDING") {
    return (
      <Button size="sm" variant="outline" disabled={pending} onClick={handleMarkPaid}>
        Mark paid (cash)
      </Button>
    );
  }
  if (status === "PAID") {
    return (
      <Button size="sm" variant="ghost" disabled={pending} onClick={handleRefund} className="text-destructive hover:text-destructive">
        Refund
      </Button>
    );
  }
  return null;
}
