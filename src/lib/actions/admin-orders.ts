"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaffOrOwner } from "@/lib/session";
import { sendEmail, escapeHtml, emailLayout } from "@/lib/email";
import { formatCents } from "@/lib/format";
import type { ActionResult } from "@/lib/actions/pets";

// Kept in lockstep with the `OrderStatus` enum in prisma/schema.prisma.
const orderStatusSchema = z.enum(["PENDING_PAYMENT", "CONFIRMED", "FULFILLED", "CANCELLED"]);

const updateStatusSchema = z.object({
  orderId: z.string().min(1, "Please try again."),
  status: orderStatusSchema,
  reason: z.string().max(300, "Reason is too long.").optional(),
});

/**
 * Owner/staff-side order status change (e.g. marking an order FULFILLED, or
 * cancelling it on the customer's behalf). Any staff/owner may act on any
 * order — there is no ownership check here, unlike the client-facing
 * cancelMyOrder in client-orders.ts, since this is an internal admin tool.
 */
export async function updateOrderStatus(input: {
  orderId: string;
  status: string;
  reason?: string;
}): Promise<ActionResult> {
  await requireStaffOrOwner();

  const parsed = updateStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check the details." };
  }

  const order = await prisma.order.findUnique({
    where: { id: parsed.data.orderId },
    include: { items: true },
  });
  if (!order) return { status: "error", message: "That order couldn't be found." };

  const nextStatus = parsed.data.status;
  const reason = parsed.data.reason?.trim().slice(0, 300) || null;

  // Write first — the database change must land regardless of whether the
  // follow-up email succeeds.
  await prisma.order.update({
    where: { id: order.id },
    data: { status: nextStatus },
  });

  if (nextStatus === "CANCELLED" && order.status !== "CANCELLED") {
    // Best-effort notification. A failed/slow send must never turn this
    // already-successful status change into an error response — wrap and
    // log instead of letting it throw or bubble up.
    try {
      await notifyOrderCancelledByStaff({
        customerName: order.contactName,
        customerEmail: order.contactEmail,
        reason,
        order: {
          id: order.id,
          totalCents: order.totalCents,
          lines: order.items.map((i) => ({ name: i.name, quantity: i.quantity, priceCents: i.priceCents })),
        },
      });
    } catch (err) {
      console.error("[updateOrderStatus] cancellation notification failed:", err);
    }
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/store/orders/${order.id}`);
  return { status: "success" };
}

type StaffCancelNotification = {
  customerName: string;
  customerEmail: string;
  reason: string | null;
  order: {
    id: string;
    totalCents: number;
    lines: { name: string; quantity: number; priceCents: number }[];
  };
};

/** Tells the CUSTOMER that we (the shop) cancelled their order — as opposed
 * to notifyOrderCancellation in client-orders.ts, which fires when the
 * customer cancels it themselves. */
async function notifyOrderCancelledByStaff(n: StaffCancelNotification): Promise<void> {
  const orderRef = `#${n.order.id.slice(-8).toUpperCase()}`;
  const listHtml = `<ul style="margin:0 0 12px;padding-left:18px;">${n.order.lines
    .map(
      (l) =>
        `<li style="margin:0 0 4px;">${escapeHtml(l.name)} × ${l.quantity} — ${escapeHtml(formatCents(l.priceCents * l.quantity))}</li>`,
    )
    .join("")}</ul>`;
  const listText = n.order.lines.map((l) => `${l.name} x${l.quantity}`).join("; ");
  const reasonHtml = n.reason ? `<p style="margin:0 0 12px;"><strong>Reason:</strong> ${escapeHtml(n.reason)}</p>` : "";

  const customerBody = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(n.customerName)},</p>
    <p style="margin:0 0 12px;">Your order <strong>${escapeHtml(orderRef)}</strong> has been cancelled by Trims &amp; Bubbles.</p>
    ${listHtml}
    ${reasonHtml}
    <p style="margin:0 0 12px;">If this doesn't seem right, just reply to this email or give us a call.</p>
    <p style="margin:0;">— The Trims &amp; Bubbles team</p>
  `;
  await sendEmail({
    to: n.customerEmail,
    subject: `Your Trims & Bubbles order ${orderRef} was cancelled`,
    html: emailLayout(customerBody),
    text: `Hi ${n.customerName}, your order ${orderRef} was cancelled by Trims & Bubbles. ${listText}.${n.reason ? ` Reason: ${n.reason}.` : ""} If this doesn't seem right, get in touch.`,
  });
}
