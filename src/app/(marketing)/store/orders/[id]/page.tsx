import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, Store as StoreIcon, Truck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/format";

export const metadata: Metadata = { title: "Order confirmed" };

export default async function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { id } = await params;
  const { token: rawToken } = await searchParams;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) notFound();

  // Authorize: either the logged-in shopper's Client record owns this order,
  // or the request carries the unguessable access token issued at checkout.
  // Anything else — including a guessed/enumerated id with no token — 404s,
  // since this route lives under the public (marketing) group and would
  // otherwise leak the customer's name, email, phone, and address.
  let authorized = Boolean(token && order.accessToken && token === order.accessToken);
  if (!authorized) {
    const session = await getCurrentSession();
    if (session) {
      const client = await prisma.client.findUnique({ where: { userId: session.user.id } });
      authorized = Boolean(client && order.clientId === client.id);
    }
  }
  if (!authorized) notFound();

  const shipping = order.fulfillment === "SHIPPING";

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-accent-solid" />
        <h1 className="mt-4 text-3xl font-black tracking-tight">Thank you, {order.contactName.split(" ")[0]}!</h1>
        <p className="mt-2 text-muted-foreground text-pretty">
          Your order is confirmed. We&apos;ve sent a confirmation to{" "}
          <span className="font-medium text-foreground">{order.contactEmail}</span>.
        </p>
        <p className="mt-1 font-mono text-sm text-muted-foreground">Order #{order.id.slice(-8).toUpperCase()}</p>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start gap-3 border-b border-border pb-4">
          {shipping ? <Truck className="mt-0.5 h-5 w-5 shrink-0 text-accent-solid" /> : <StoreIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent-solid" />}
          <div>
            <p className="font-bold">{shipping ? "Shipping to you" : "Pickup in-store"}</p>
            {shipping ? (
              <p className="text-sm text-muted-foreground whitespace-pre-line">{order.shippingAddress}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                We&apos;ll text {order.contactPhone} when it&apos;s ready to collect (usually 1–2 days).
              </p>
            )}
          </div>
        </div>

        <ul className="mt-4 space-y-3">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md ring-1 ring-border">
                {item.imageUrl && <Image src={item.imageUrl} alt="" fill className="object-cover" sizes="48px" />}
              </div>
              <span className="min-w-0 flex-1 text-sm font-medium">
                {item.name} <span className="text-muted-foreground">× {item.quantity}</span>
              </span>
              <span className="text-sm font-semibold">{formatCents(item.priceCents * item.quantity)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>{formatCents(order.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{shipping ? "Shipping" : "Pickup"}</dt>
            <dd>{order.shippingCents === 0 ? "Free" : formatCents(order.shippingCents)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5 text-base font-extrabold">
            <dt>Total</dt>
            <dd>{formatCents(order.totalCents)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-8 flex justify-center gap-3">
        <Button variant="outline" render={<Link href="/store" />}>
          Keep shopping
        </Button>
        <Button render={<Link href="/" />}>Back to home</Button>
      </div>
    </div>
  );
}
