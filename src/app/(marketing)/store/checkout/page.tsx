"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Store as StoreIcon, Truck, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCart } from "@/components/store/cart-context";
import { SHIPPING_CENTS, FREE_SHIPPING_THRESHOLD_CENTS } from "@/config/store";
import { formatCents } from "@/lib/format";
import { placeOrder } from "@/lib/actions/store";
import { businessConfig } from "@/config/business";
import { cn } from "@/lib/utils";

type Fulfillment = "PICKUP" | "SHIPPING";

export default function CheckoutPage() {
  const router = useRouter();
  const { lines, subtotalCents, clear } = useCart();

  const [fulfillment, setFulfillment] = useState<Fulfillment>("PICKUP");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shippingCents =
    fulfillment === "SHIPPING" && subtotalCents < FREE_SHIPPING_THRESHOLD_CENTS ? SHIPPING_CENTS : 0;
  const totalCents = subtotalCents + shippingCents;
  const canSubmit = name.trim() && email.trim() && phone.trim() && (fulfillment === "PICKUP" || address.trim());

  if (placed) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-24 text-center sm:px-6">
        <Loader2 className="h-8 w-8 animate-spin text-accent-solid" />
        <p className="text-muted-foreground">Placing your order…</p>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center sm:px-6">
        <h1 className="text-2xl font-extrabold">Your cart is empty</h1>
        <p className="mt-2 text-muted-foreground">Add a few goodies before checking out.</p>
        <Button className="mt-6" render={<Link href="/store" />}>
          Browse the shop
        </Button>
      </div>
    );
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const result = await placeOrder({
      items: lines.map((l) => ({ slug: l.slug, quantity: l.quantity })),
      fulfillment,
      contactName: name.trim(),
      contactEmail: email.trim(),
      contactPhone: phone.trim(),
      shippingAddress: fulfillment === "SHIPPING" ? address.trim() : undefined,
      notes: notes.trim() || undefined,
    });
    if (result.status === "success") {
      setPlaced(true);
      const id = result.orderId;
      const token = result.accessToken;
      clear();
      router.push(`/store/orders/${id}?token=${encodeURIComponent(token)}`);
    } else {
      setSubmitting(false);
      setError(result.message);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-black tracking-tight">Checkout</h1>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1.3fr_1fr]">
        {/* ---- Form ---- */}
        <div className="space-y-8">
          {/* Fulfilment */}
          <div>
            <h2 className="text-lg font-extrabold">How would you like to get it?</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  { key: "PICKUP", icon: StoreIcon, title: "Pick up in-store", sub: "Free · ready in 1–2 days" },
                  { key: "SHIPPING", icon: Truck, title: "Ship it to me", sub: shippingCents === 0 ? "Free shipping" : `${formatCents(SHIPPING_CENTS)} flat rate` },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setFulfillment(opt.key)}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                    fulfillment === opt.key ? "border-accent-solid bg-accent/40 ring-1 ring-accent-solid" : "border-border hover:bg-muted",
                  )}
                >
                  <opt.icon className="mt-0.5 h-5 w-5 shrink-0 text-accent-solid" />
                  <span>
                    <span className="block font-bold">{opt.title}</span>
                    <span className="block text-sm text-muted-foreground">{opt.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h2 className="text-lg font-extrabold">Your details</h2>
            <div className="space-y-1.5">
              <Label htmlFor="co-name">Full name</Label>
              <Input id="co-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="co-email">Email</Label>
                <Input id="co-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="co-phone">Phone</Label>
                <Input id="co-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>
            </div>
            {fulfillment === "SHIPPING" && (
              <div className="space-y-1.5">
                <Label htmlFor="co-address">Shipping address</Label>
                <Textarea
                  id="co-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  rows={3}
                  placeholder="Street, suburb, state, postcode"
                  required
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="co-notes">Order notes (optional)</Label>
              <Textarea id="co-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* ---- Summary ---- */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-extrabold">Order summary</h2>
            <ul className="mt-4 space-y-3">
              {lines.map((line) => (
                <li key={line.slug} className="flex items-center gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-secondary ring-1 ring-border">
                    {line.image && <Image src={line.image} alt="" fill className="object-cover" sizes="48px" />}
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-bold text-background">
                      {line.quantity}
                    </span>
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{line.name}</span>
                  <span className="text-sm font-semibold">{formatCents(line.priceCents * line.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>{formatCents(subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{fulfillment === "PICKUP" ? "Pickup" : "Shipping"}</dt>
                <dd>{shippingCents === 0 ? "Free" : formatCents(shippingCents)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-1.5 text-base font-extrabold">
                <dt>Total</dt>
                <dd>{formatCents(totalCents)}</dd>
              </div>
            </dl>
            <Button size="lg" className="mt-5 w-full" disabled={!canSubmit || submitting} onClick={handleSubmit}>
              {submitting ? "Placing order…" : `Place order · ${formatCents(totalCents)}`}
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              No online payment needed for now — we&apos;ll confirm your order and payment on pickup/delivery.
            </p>
            <p className="mt-3 border-t border-border pt-3 text-center text-xs text-muted-foreground">
              Any trouble? Call{" "}
              <a href={`tel:${businessConfig.contact.phone.replace(/[^\d+]/g, "")}`} className="font-medium text-foreground hover:text-primary">
                {businessConfig.contact.phone}
              </a>{" "}
              or email{" "}
              <a href={`mailto:${businessConfig.contact.email}`} className="font-medium text-foreground hover:text-primary">
                {businessConfig.contact.email}
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
