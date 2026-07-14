"use server";

import { z } from "zod";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/session";
import { isStripeConfigured } from "@/lib/stripe";
import { SHIPPING_CENTS, FREE_SHIPPING_THRESHOLD_CENTS } from "@/config/store";
import { getProductBySlug } from "@/lib/store-data";
import type { Product } from "../../generated/prisma/client";

const orderSchema = z.object({
  items: z
    .array(z.object({ slug: z.string().min(1), quantity: z.number().int().min(1).max(99) }))
    .min(1, "Your cart is empty."),
  fulfillment: z.enum(["PICKUP", "SHIPPING"]),
  contactName: z.string().min(1, "Please enter your name.").max(100, "Name is too long."),
  contactEmail: z.string().email("Please enter a valid email.").max(200, "Email is too long."),
  contactPhone: z.string().min(1, "Please enter a contact number.").max(30, "Phone number is too long."),
  shippingAddress: z.string().max(300, "Address is too long.").optional(),
  notes: z.string().max(1000, "Notes are too long.").optional(),
});

export type PlaceOrderInput = z.infer<typeof orderSchema>;
export type PlaceOrderResult =
  | { status: "success"; orderId: string; accessToken: string }
  | { status: "error"; message: string };

/**
 * Places a store order. Prices/names are resolved from the server-side
 * catalogue (never trusted from the client). Fulfilment is Pickup (free) or
 * Shipping (flat rate, free over the threshold). Guests can order; a logged-in
 * client is linked automatically. With no Stripe configured the order is
 * confirmed immediately — same "prototype works end-to-end" behaviour as the
 * booking flow.
 */
export async function placeOrder(rawInput: PlaceOrderInput): Promise<PlaceOrderResult> {
  const parsed = orderSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check your details." };
  }
  const input = parsed.data;

  if (input.fulfillment === "SHIPPING" && !input.shippingAddress?.trim()) {
    return { status: "error", message: "A shipping address is required for delivery." };
  }

  // Resolve every line against the LIVE catalogue (DB), never trusting the
  // client's prices/names. Reject anything missing, hidden (inactive) or sold
  // out — a shopper must not be able to order something the owner pulled.
  const resolvedLines = await Promise.all(
    input.items.map(async (line) => {
      const product = await getProductBySlug(line.slug);
      if (!product || !product.active || product.soldOut) return null;
      return { product, quantity: line.quantity };
    }),
  );
  const resolved = resolvedLines.filter(
    (x): x is { product: Product; quantity: number } => x !== null,
  );

  if (!resolved.length) {
    return { status: "error", message: "None of those products are available anymore." };
  }

  // Fail CLOSED: if this deployment is production and Stripe is configured,
  // shoppers expect real payment to be collected — but the store checkout has
  // no Stripe Checkout/payment-intent wiring yet. Refuse rather than silently
  // mark an order confirmed without ever taking payment.
  // TODO: once the store has a payment step, branch here into a Stripe
  // Checkout session for the store (mirroring the booking deposit flow in
  // src/lib/actions/booking.ts) instead of returning this error.
  if (process.env.NODE_ENV === "production" && isStripeConfigured()) {
    return {
      status: "error",
      message: "Online store payment isn't available yet. Please contact us to place this order.",
    };
  }

  const subtotalCents = resolved.reduce((sum, l) => sum + l.product.priceCents * l.quantity, 0);
  const shippingCents =
    input.fulfillment === "SHIPPING" && subtotalCents < FREE_SHIPPING_THRESHOLD_CENTS ? SHIPPING_CENTS : 0;
  const totalCents = subtotalCents + shippingCents;

  // Link to the client record if the shopper happens to be logged in.
  let clientId: string | null = null;
  const session = await getCurrentSession();
  if (session) {
    const client = await prisma.client.findUnique({ where: { userId: session.user.id } });
    clientId = client?.id ?? null;
  }

  // No online payment configured — order is a request; owner arranges
  // payment on pickup/delivery. "CONFIRMED" here means the order request was
  // received, not that payment was captured (nothing in the admin/orders
  // view or the confirmation page claims money changed hands).
  const accessToken = randomUUID();

  const order = await prisma.order.create({
    data: {
      clientId,
      accessToken,
      contactName: input.contactName.trim(),
      contactEmail: input.contactEmail.trim(),
      contactPhone: input.contactPhone.trim(),
      fulfillment: input.fulfillment,
      shippingAddress: input.fulfillment === "SHIPPING" ? input.shippingAddress?.trim() || null : null,
      status: "CONFIRMED",
      subtotalCents,
      shippingCents,
      totalCents,
      notes: input.notes?.trim() || null,
      items: {
        create: resolved.map((l) => ({
          productSlug: l.product.slug,
          name: l.product.name,
          priceCents: l.product.priceCents,
          quantity: l.quantity,
          imageUrl: l.product.imageUrl,
        })),
      },
    },
  });

  revalidatePath("/admin/orders");
  return { status: "success", orderId: order.id, accessToken };
}
