"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { runAction } from "@/lib/run-action";
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
      await runAction(() => markPaymentPaidManually(paymentId), {
        success: "Marked as paid",
        onSuccess: () => router.refresh(),
      });
    });
  }

  async function handleRefundConfirmed() {
    await runAction(() => refundPayment({ paymentId }), {
      success: "Refund recorded",
      onSuccess: () => router.refresh(),
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
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="destructive">
            Refund {formatCents(amountCents)}
          </Button>
        }
        title={`Refund ${formatCents(amountCents)}?`}
        description="This sends the money back to the client and can't be undone."
        confirmLabel="Refund payment"
        cancelLabel="Don't refund"
        variant="destructive"
        onConfirm={handleRefundConfirmed}
      />
    );
  }
  return null;
}
