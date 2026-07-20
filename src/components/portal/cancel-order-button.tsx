"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { runAction } from "@/lib/run-action";
import { cancelMyOrder } from "@/lib/actions/client-orders";

/**
 * Lets a logged-in customer cancel their own order from the portal or the
 * post-checkout receipt page. Only cancellable statuses should ever render
 * this — the server action re-checks anyway (see CANCELLABLE in
 * client-orders.ts) so this is UX, not the security boundary.
 */
export function CancelOrderButton({
  orderId,
  orderRef,
  className,
}: {
  orderId: string;
  orderRef?: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive" size="touch" className={className}>
          Cancel order
        </Button>
      }
      title="Cancel your order?"
      description={
        <>
          {orderRef ? (
            <>
              Order <strong>{orderRef}</strong> will be cancelled
            </>
          ) : (
            "This order will be cancelled"
          )}{" "}
          and we&apos;ll let you know it&apos;s sorted. This can&apos;t be undone.
        </>
      }
      confirmLabel="Yes, cancel it"
      cancelLabel="Keep order"
      variant="destructive"
      onConfirm={async () => {
        await runAction(() => cancelMyOrder({ orderId }), {
          success: "Your order has been cancelled.",
          onSuccess: () => router.refresh(),
        });
      }}
    />
  );
}
