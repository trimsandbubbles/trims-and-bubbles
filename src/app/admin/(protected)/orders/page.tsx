import { ShoppingBag, Store as StoreIcon, Truck } from "lucide-react";
import { requireStaffOrOwner } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { OrderStatusActions } from "@/components/admin/order-status-actions";

const dateFmt = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** Plain-English status badge — mirrors the wording used in
 * OrderStatusActions so the owner sees consistent language throughout. */
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING_PAYMENT: "outline",
  CONFIRMED: "default",
  FULFILLED: "secondary",
  CANCELLED: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  CONFIRMED: "Confirmed",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
};

function OrderStatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{STATUS_LABEL[status] ?? status}</Badge>;
}

export default async function AdminOrdersPage() {
  await requireStaffOrOwner();
  const orders = await prisma.order.findMany({
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight">Store Orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">Online shop orders — for pickup or shipping.</p>

      {orders.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-12 text-center">
          <ShoppingBag className="h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">No online orders yet.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold">#{order.id.slice(-8).toUpperCase()}</p>
                  <p className="text-sm text-muted-foreground">
                    {order.contactName} · {order.contactPhone} · {order.contactEmail}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{dateFmt.format(order.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-extrabold">{formatCents(order.totalCents)}</p>
                  <div className="mt-1 flex items-center justify-end gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">
                      {order.fulfillment === "SHIPPING" ? (
                        <>
                          <Truck className="h-3.5 w-3.5" /> Ship
                        </>
                      ) : (
                        <>
                          <StoreIcon className="h-3.5 w-3.5" /> Pickup
                        </>
                      )}
                    </span>
                    <OrderStatusBadge status={order.status} />
                  </div>
                </div>
              </div>

              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
                {order.items.map((item) => (
                  <li key={item.id}>
                    {item.quantity}× {item.name}
                  </li>
                ))}
              </ul>

              {order.fulfillment === "SHIPPING" && order.shippingAddress && (
                <p className="mt-2 text-sm">
                  <span className="font-medium">Ship to:</span>{" "}
                  <span className="text-muted-foreground whitespace-pre-line">{order.shippingAddress}</span>
                </p>
              )}
              {order.notes && (
                <p className="mt-1 text-sm">
                  <span className="font-medium">Note:</span> <span className="text-muted-foreground">{order.notes}</span>
                </p>
              )}

              {order.status !== "FULFILLED" && order.status !== "CANCELLED" && (
                <div className="mt-3 border-t border-border pt-3">
                  <OrderStatusActions orderId={order.id} status={order.status} fulfillment={order.fulfillment} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
