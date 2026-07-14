"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getStripeClient, isStripeConfigured, siteUrl } from "@/lib/stripe";
import { computeBalanceOwingCents } from "@/lib/payments-data";

export type CheckoutResult = { status: "success"; checkoutUrl: string } | { status: "error"; message: string };

const THIRTY_MINUTES_SECONDS = 30 * 60;

/**
 * Client-initiated: pay the remaining balance on one of their own
 * appointments via a Stripe Checkout Session. Ownership is re-derived from
 * the session, never trusted from the caller (see Next.js Server Actions
 * security guidance — the appointmentId is just a reference, not proof of
 * access).
 */
export async function createBalanceCheckoutSession(appointmentId: string): Promise<CheckoutResult> {
  if (!isStripeConfigured()) {
    return { status: "error", message: "Online payment isn't set up yet — please contact the team." };
  }

  const session = await requireSession();
  const client = await prisma.client.findUnique({ where: { userId: session.user.id } });
  if (!client) return { status: "error", message: "No account found." };

  const apt = await prisma.appointment.findFirst({
    where: { id: appointmentId, clientId: client.id },
    include: { pet: true, primaryService: true, payments: true },
  });
  if (!apt) return { status: "error", message: "Appointment not found." };
  if (apt.status === "CANCELLED" || apt.status === "NO_SHOW") {
    return { status: "error", message: "This appointment is no longer active." };
  }

  const balanceOwingCents = computeBalanceOwingCents(apt.totalPriceCents, apt.payments);
  if (balanceOwingCents <= 0) {
    return { status: "error", message: "There's no balance owing on this appointment." };
  }

  const stripe = getStripeClient();
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "aud",
          unit_amount: balanceOwingCents,
          product_data: { name: `Balance — ${apt.primaryService.name} for ${apt.pet.name}` },
        },
        quantity: 1,
      },
    ],
    success_url: `${siteUrl()}/portal/appointments/${apt.id}?paid=1`,
    cancel_url: `${siteUrl()}/portal/appointments/${apt.id}`,
    expires_at: Math.floor(Date.now() / 1000) + THIRTY_MINUTES_SECONDS,
    metadata: { appointmentId: apt.id, paymentType: "BALANCE" },
  });

  if (!checkoutSession.url) {
    return { status: "error", message: "Couldn't start checkout — please try again." };
  }

  await prisma.payment.create({
    data: {
      appointmentId: apt.id,
      type: "BALANCE",
      amountCents: balanceOwingCents,
      status: "PENDING",
      method: "STRIPE",
      stripeCheckoutSessionId: checkoutSession.id,
    },
  });

  return { status: "success", checkoutUrl: checkoutSession.url };
}
