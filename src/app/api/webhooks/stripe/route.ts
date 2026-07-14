import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { getStripeClient, isStripeWebhookConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";

/**
 * Source of truth for payment status — NOT the success-page redirect, which
 * a client could close before it fires (see the plan's Payments flow notes).
 * Reads the raw request body (request.text(), not .json()) because Stripe's
 * signature check is an HMAC over the exact bytes sent.
 */
export async function POST(request: NextRequest) {
  if (!isStripeWebhookConfigured()) {
    return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 400 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const stripe = getStripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case "checkout.session.expired":
      await handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
      break;
    default:
      // Other event types (charge.refunded, etc.) aren't acted on yet —
      // refunds are currently issued from the admin panel, which records
      // its own ledger row directly.
      break;
  }

  return NextResponse.json({ received: true });
}

function revalidateForAppointment(appointmentId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/payments");
  revalidatePath(`/admin/appointments/${appointmentId}`);
  revalidatePath("/portal");
  revalidatePath("/portal/appointments");
  revalidatePath("/portal/payments");
  revalidatePath(`/portal/appointments/${appointmentId}`);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const payment = await prisma.payment.findFirst({ where: { stripeCheckoutSessionId: session.id } });
  if (!payment) return; // not a session we created a Payment row for
  if (payment.status === "PAID") return; // already processed — webhooks can be delivered more than once

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "PAID", paidAt: new Date(), stripePaymentIntentId: paymentIntentId },
  });

  if (payment.type === "DEPOSIT") {
    const appointment = await prisma.appointment.findUnique({ where: { id: payment.appointmentId } });
    if (appointment?.status === "PENDING_PAYMENT") {
      await prisma.appointment.update({ where: { id: payment.appointmentId }, data: { status: "CONFIRMED" } });
    }
  }

  revalidateForAppointment(payment.appointmentId);
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const payment = await prisma.payment.findFirst({ where: { stripeCheckoutSessionId: session.id } });
  if (!payment || payment.status !== "PENDING") return;

  await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });

  // An unpaid deposit means the booking never actually confirmed — release
  // the slot rather than leaving it squatted indefinitely. A balance
  // payment expiring doesn't touch appointment status (the job already
  // happened; the client can just try paying again from the portal).
  if (payment.type === "DEPOSIT") {
    const appointment = await prisma.appointment.findUnique({ where: { id: payment.appointmentId } });
    if (appointment?.status === "PENDING_PAYMENT") {
      await prisma.appointment.update({
        where: { id: payment.appointmentId },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "Deposit payment expired" },
      });
    }
  }

  revalidateForAppointment(payment.appointmentId);
}
