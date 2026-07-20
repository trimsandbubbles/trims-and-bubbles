import type { Metadata } from "next";
import Link from "next/link";
import { Package, ArrowRight, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CancelOrderButton } from "@/components/portal/cancel-order-button";
import { getCurrentSession } from "@/lib/session";
import { getBusinessDetails } from "@/lib/business-data";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";

export const metadata: Metadata = { title: "Orders" };

/** Statuses a customer can still cancel from here. Mirrors CANCELLABLE in
 * src/lib/actions/client-orders.ts (not imported — that constant isn't
 * exported, and this copy is UX only; the server action re-checks). */
const CANCELLABLE = new Set(["PENDING_PAYMENT", "CONFIRMED"]);

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

const dateFmt = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function PortalOrdersPage() {
  const session = await getCurrentSession();
  const client = await prisma.client.findUnique({ where: { userId: session!.user.id } });

  const [orders, business] = await Promise.all([
    client
      ? prisma.order.findMany({
          where: { clientId: client.id },
          orderBy: { createdAt: "desc" },
          include: { items: true },
        })
      : Promise.resolve([]),
    getBusinessDetails(),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Orders</h1>
          <p className="mt-1 text-muted-foreground">Your online store orders.</p>
        </div>
        <Button render={<Link href="/store" />}>Shop</Button>
      </div>

      {orders.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Package className="h-7 w-7" />
            <p>No orders yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 space-y-3">
          {orders.map((order) => {
            const cancellable = CANCELLABLE.has(order.status);
            const orderRef = `#${order.id.slice(-8).toUpperCase()}`;
            const itemSummary = order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ");

            return (
              <Card key={order.id}>
                <CardContent className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/store/orders/${order.id}`}
                        className="group inline-flex items-center gap-1.5 font-mono text-sm font-semibold hover:text-accent-solid"
                      >
                        {orderRef}
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">{dateFmt.format(order.createdAt)}</p>
                      <p className="mt-1.5 text-sm text-muted-foreground">{itemSummary}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="font-semibold">{formatCents(order.totalCents)}</span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                  </div>

                  <div className="mt-3 border-t border-border pt-3">
                    {cancellable ? (
                      <CancelOrderButton orderId={order.id} orderRef={orderRef} />
                    ) : order.status === "FULFILLED" ? (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" /> This order is complete. Need something changed? Call us on{" "}
                        {business.contactPhone}.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">This order was cancelled.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
