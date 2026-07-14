/**
 * Shared balance math — used by the portal appointment page, the admin
 * appointment page, and the balance-checkout action, so this formula only
 * lives in one place. A REFUND is its own ledger row (see
 * admin-payments.ts's refundPayment for why) rather than a mutation of the
 * original payment, so balance owing nets DEPOSIT/BALANCE/FULL rows against
 * REFUND rows instead of trusting any single row's status.
 */
export type PaymentForBalance = { status: string; type: string; amountCents: number };

export function computeBalanceOwingCents(totalPriceCents: number, payments: PaymentForBalance[]): number {
  const paidCents = payments.filter((p) => p.status === "PAID" && p.type !== "REFUND").reduce((sum, p) => sum + p.amountCents, 0);
  const refundedCents = payments.filter((p) => p.status === "PAID" && p.type === "REFUND").reduce((sum, p) => sum + p.amountCents, 0);
  return Math.max(0, totalPriceCents - paidCents + refundedCents);
}
