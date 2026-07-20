"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { getBusinessSettings } from "@/lib/services-data";
import { sendEmail, escapeHtml, emailLayout } from "@/lib/email";
import { businessConfig } from "@/config/business";
import { formatCents } from "@/lib/format";
import type { ActionResult } from "@/lib/actions/pets";

/** Statuses a customer is allowed to cancel from the portal. Once an order has
 * shipped/been picked up (FULFILLED) or is already cancelled, they need to
 * phone instead. Mirrors CANCELLABLE in client-appointments.ts. */
const CANCELLABLE = new Set(["PENDING_PAYMENT", "CONFIRMED"]);

const cancelOrderSchema = z.object({
  orderId: z.string().min(1, "Please try again."),
  reason: z.string().max(300, "Reason is too long.").optional(),
});

function resolveOwnerEmail(settingsContactEmail: string | null | undefined): string {
  return settingsContactEmail || process.env.OWNER_NOTIFICATION_EMAIL || businessConfig.contact.email;
}

/**
 * Lets a logged-in client cancel their OWN store order. The order is resolved
 * from the session's client id — never trusted from the input — so a client
 * can only ever cancel their own order. Mirrors cancelMyAppointment in
 * client-appointments.ts.
 */
export async function cancelMyOrder(input: { orderId: string; reason?: string }): Promise<ActionResult> {
  const parsed = cancelOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Please check your details." };
  }

  const session = await requireSession();
  const client = await prisma.client.findUnique({ where: { userId: session.user.id } });
  if (!client) return { status: "error", message: "We couldn't find your account." };

  const order = await prisma.order.findFirst({
    where: { id: parsed.data.orderId, clientId: client.id },
    include: { items: true },
  });
  if (!order) return { status: "error", message: "That order couldn't be found." };
  if (!CANCELLABLE.has(order.status)) {
    return { status: "error", message: "This order can no longer be cancelled online — please give us a call." };
  }

  const reason = parsed.data.reason?.trim().slice(0, 300) || null;

  // NOTE: unlike Appointment, the Order model has no cancelReason/cancelledAt
  // column — only `status` is persisted here. The reason (if given) is still
  // passed through to the notification emails below so nothing is lost.
  await prisma.order.update({
    where: { id: order.id },
    data: { status: "CANCELLED" },
  });

  // Best-effort notifications. The database write above has already
  // committed, so a slow/failed send must never turn this into an error
  // response — wrap and log instead of letting it throw or bubble up.
  try {
    const settings = await getBusinessSettings();
    await notifyOrderCancellation({
      ownerEmail: settings.contactEmail,
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
    console.error("[cancelMyOrder] notification failed:", err);
  }

  revalidatePath(`/store/orders/${order.id}`);
  revalidatePath("/admin/orders");
  return { status: "success" };
}

type OrderCancelNotification = {
  ownerEmail: string | null | undefined;
  customerName: string;
  customerEmail: string;
  reason: string | null;
  order: {
    id: string;
    totalCents: number;
    lines: { name: string; quantity: number; priceCents: number }[];
  };
};

/** Emails the OWNER that a customer cancelled their order, and confirms to the
 * customer. Fire-and-forget from the caller's perspective — sendEmail itself
 * is already fail-soft, and the caller wraps this call too. */
async function notifyOrderCancellation(n: OrderCancelNotification): Promise<void> {
  const orderRef = `#${n.order.id.slice(-8).toUpperCase()}`;
  const listHtml = `<ul style="margin:0 0 12px;padding-left:18px;">${n.order.lines
    .map(
      (l) =>
        `<li style="margin:0 0 4px;">${escapeHtml(l.name)} × ${l.quantity} — ${escapeHtml(formatCents(l.priceCents * l.quantity))}</li>`,
    )
    .join("")}</ul>`;
  const listText = n.order.lines.map((l) => `${l.name} x${l.quantity}`).join("; ");
  const reasonHtml = n.reason ? `<p style="margin:0 0 12px;"><strong>Reason:</strong> ${escapeHtml(n.reason)}</p>` : "";

  // Owner alert.
  const ownerBody = `
    <p style="margin:0 0 12px;">A customer has <strong>cancelled</strong> their store order.</p>
    <p style="margin:0 0 6px;">Order <strong>${escapeHtml(orderRef)}</strong> · <strong>${escapeHtml(formatCents(n.order.totalCents))}</strong></p>
    ${listHtml}
    <p style="margin:0 0 6px;">Customer: ${escapeHtml(n.customerName)} (${escapeHtml(n.customerEmail)})</p>
    ${reasonHtml}
  `;
  await sendEmail({
    to: resolveOwnerEmail(n.ownerEmail),
    subject: `Order cancelled — ${orderRef} (${formatCents(n.order.totalCents)})`,
    html: emailLayout(ownerBody),
    text: `A customer cancelled order ${orderRef} (${formatCents(n.order.totalCents)}). ${listText}. Customer: ${n.customerName} (${n.customerEmail}).${n.reason ? ` Reason: ${n.reason}.` : ""}`,
    replyTo: n.customerEmail,
  });

  // Customer confirmation.
  const customerBody = `
    <p style="margin:0 0 12px;">Hi ${escapeHtml(n.customerName)},</p>
    <p style="margin:0 0 12px;">Your order <strong>${escapeHtml(orderRef)}</strong> has been cancelled — no worries at all.</p>
    ${listHtml}
    <p style="margin:0 0 12px;">We'd love to see you again; shop with us whenever suits you.</p>
    <p style="margin:0;">— The Trims &amp; Bubbles team</p>
  `;
  await sendEmail({
    to: n.customerEmail,
    subject: `Your Trims & Bubbles order ${orderRef} is cancelled`,
    html: emailLayout(customerBody),
    text: `Hi ${n.customerName}, your order ${orderRef} has been cancelled. ${listText}. Shop with us again whenever suits you. — Trims & Bubbles`,
  });
}
