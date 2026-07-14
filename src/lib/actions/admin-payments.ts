"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/session";
import type { ActionResult } from "@/lib/actions/pets";

/** Thrown inside the refund transaction to abort the write while carrying a
 * user-facing message back out to a clean error ActionResult. */
class RefundCapError extends Error {}

function revalidatePaymentPaths(appointmentId: string) {
  revalidatePath("/admin/payments");
  revalidatePath("/admin");
  revalidatePath(`/admin/appointments/${appointmentId}`);
  revalidatePath("/portal/payments");
  revalidatePath(`/portal/appointments/${appointmentId}`);
}

/** Manually reconciles a pending payment as paid (e.g. the client paid cash
 * or by bank transfer instead of the original Stripe checkout). */
export async function markPaymentPaidManually(paymentId: string): Promise<ActionResult> {
  await requireOwner();
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return { status: "error", message: "Payment not found." };
  if (payment.status === "PAID") return { status: "success" };

  await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "PAID", method: "CASH", paidAt: new Date() },
  });

  if (payment.type === "DEPOSIT") {
    const appointment = await prisma.appointment.findUnique({ where: { id: payment.appointmentId } });
    if (appointment?.status === "PENDING_PAYMENT") {
      await prisma.appointment.update({ where: { id: payment.appointmentId }, data: { status: "CONFIRMED" } });
    }
  }

  revalidatePaymentPaths(payment.appointmentId);
  return { status: "success" };
}

const refundSchema = z.object({
  paymentId: z.string().min(1),
  amountCents: z.number().int().positive().optional(),
});

/** Records a refund as its own ledger row (type REFUND) against the same
 * appointment, rather than mutating the original payment — so the payment
 * history stays an accurate audit trail of what actually happened. */
export async function refundPayment(input: z.infer<typeof refundSchema>): Promise<ActionResult> {
  await requireOwner();
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Please check the refund amount." };

  const payment = await prisma.payment.findUnique({ where: { id: parsed.data.paymentId } });
  if (!payment) return { status: "error", message: "Payment not found." };
  if (payment.status !== "PAID") return { status: "error", message: "Only paid payments can be refunded." };

  const amountCents = parsed.data.amountCents ?? payment.amountCents;
  if (amountCents > payment.amountCents) {
    return { status: "error", message: "Refund can't be more than the original payment." };
  }

  // Deliberately does NOT change the original payment's own status. Like
  // Stripe's own model (a Charge stays "succeeded"; a Refund is a separate
  // object), the refund is its own ledger row — that keeps partial refunds
  // accurate and preserves the original payment as a true historical record.
  // Balance-owing math elsewhere nets DEPOSIT/BALANCE/FULL rows against
  // REFUND rows rather than relying on any single row's status.
  //
  // Cumulative cap: refunds aren't linked to a specific originating payment in
  // the schema, so we net at the APPOINTMENT level — exactly the way
  // computeBalanceOwingCents (payments-data.ts) does — summing PAID non-REFUND
  // rows (paidCents) against PAID REFUND rows (refundedCents) and rejecting any
  // refund that would push cumulative refunds past what was actually paid.
  // The read-check-write runs in a Serializable transaction so two concurrent
  // refund clicks can't both pass the check and double-refund (TOCTOU).
  try {
    await prisma.$transaction(
      async (tx) => {
        const appointmentPayments = await tx.payment.findMany({
          where: { appointmentId: payment.appointmentId, status: "PAID" },
          select: { type: true, amountCents: true },
        });
        const paidCents = appointmentPayments
          .filter((p) => p.type !== "REFUND")
          .reduce((sum, p) => sum + p.amountCents, 0);
        const refundedCents = appointmentPayments
          .filter((p) => p.type === "REFUND")
          .reduce((sum, p) => sum + p.amountCents, 0);

        if (refundedCents + amountCents > paidCents) {
          throw new RefundCapError("That would refund more than has been paid on this appointment.");
        }

        await tx.payment.create({
          data: {
            appointmentId: payment.appointmentId,
            type: "REFUND",
            amountCents,
            status: "PAID",
            method: payment.method,
            paidAt: new Date(),
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    if (err instanceof RefundCapError) return { status: "error", message: err.message };
    // A Serializable write-conflict (P2034) means a concurrent refund won the
    // race; fail safe rather than risk a double refund.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      return { status: "error", message: "Another refund was just recorded — please refresh and try again." };
    }
    throw err;
  }

  revalidatePaymentPaths(payment.appointmentId);
  return { status: "success" };
}
