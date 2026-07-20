"use client";

import { useRouter } from "next/navigation";
import { CheckCircle2, PackageCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { runAction } from "@/lib/run-action";
import { updateOrderStatus } from "@/lib/actions/admin-orders";

/**
 * Owner-facing controls to move a store order through its lifecycle. The
 * owner is non-technical, so every action is a plain-English label rather
 * than the raw OrderStatus enum value:
 *   PENDING_PAYMENT -> "Confirm order"     (-> CONFIRMED)
 *   CONFIRMED       -> "Mark as picked up" or "Mark as shipped", depending
 *                      on how the customer chose to receive it (-> FULFILLED)
 *   any non-terminal status -> "Cancel order" (-> CANCELLED, emails the
 *                      customer — confirmed via ConfirmDialog first)
 * FULFILLED and CANCELLED are terminal — no further actions render.
 */
export function OrderStatusActions({
  orderId,
  status,
  fulfillment,
}: {
  orderId: string;
  status: string;
  fulfillment: "PICKUP" | "SHIPPING";
}) {
  const router = useRouter();

  if (status === "FULFILLED" || status === "CANCELLED") return null;

  async function setStatus(next: string) {
    await runAction(() => updateOrderStatus({ orderId, status: next }), {
      success: "Order updated.",
      onSuccess: () => router.refresh(),
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "PENDING_PAYMENT" && (
        <Button variant="outline" size="sm" onClick={() => setStatus("CONFIRMED")}>
          <CheckCircle2 className="h-4 w-4" /> Confirm order
        </Button>
      )}
      {status === "CONFIRMED" &&
        (fulfillment === "SHIPPING" ? (
          <Button variant="outline" size="sm" onClick={() => setStatus("FULFILLED")}>
            <Truck className="h-4 w-4" /> Mark as shipped
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setStatus("FULFILLED")}>
            <PackageCheck className="h-4 w-4" /> Mark as picked up
          </Button>
        ))}
      <ConfirmDialog
        trigger={
          <Button variant="destructive" size="sm">
            Cancel order
          </Button>
        }
        title="Cancel this order?"
        description={
          <>
            We&apos;ll email the customer to let them know their order has been cancelled. This can&apos;t be undone.
          </>
        }
        confirmLabel="Yes, cancel it"
        cancelLabel="Keep order"
        variant="destructive"
        onConfirm={() => setStatus("CANCELLED")}
      />
    </div>
  );
}
