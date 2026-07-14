import { describe, expect, it } from "vitest";
import { computeBalanceOwingCents, type PaymentForBalance } from "./payments-data";

// This formula previously shipped a double-counting bug: an earlier version
// of the refund action flipped the *original* payment's status to REFUNDED
// (removing it from "paid") while *also* creating a new REFUND row that got
// subtracted again, so a fully-refunded $100 deposit produced $120 owing on
// a $100 job instead of $100. The fix (never mutate the original payment;
// only ever add a new REFUND ledger row, matching Stripe's own Charge/Refund
// model) is what these tests pin down.

describe("computeBalanceOwingCents", () => {
  it("owes the full price when there are no payments at all", () => {
    expect(computeBalanceOwingCents(10000, [])).toBe(10000);
  });

  it("ignores PENDING and FAILED payments — only PAID counts", () => {
    const payments: PaymentForBalance[] = [
      { status: "PENDING", type: "DEPOSIT", amountCents: 2000 },
      { status: "FAILED", type: "DEPOSIT", amountCents: 2000 },
    ];
    expect(computeBalanceOwingCents(10000, payments)).toBe(10000);
  });

  it("subtracts a paid deposit from the total", () => {
    const payments: PaymentForBalance[] = [{ status: "PAID", type: "DEPOSIT", amountCents: 2000 }];
    expect(computeBalanceOwingCents(10000, payments)).toBe(8000);
  });

  it("returns zero once a FULL payment covers the whole price", () => {
    const payments: PaymentForBalance[] = [{ status: "PAID", type: "FULL", amountCents: 10000 }];
    expect(computeBalanceOwingCents(10000, payments)).toBe(0);
  });

  it("sums a deposit plus a later balance payment down to zero", () => {
    const payments: PaymentForBalance[] = [
      { status: "PAID", type: "DEPOSIT", amountCents: 2000 },
      { status: "PAID", type: "BALANCE", amountCents: 8000 },
    ];
    expect(computeBalanceOwingCents(10000, payments)).toBe(0);
  });

  it("clamps at zero rather than going negative on an overpayment", () => {
    const payments: PaymentForBalance[] = [{ status: "PAID", type: "FULL", amountCents: 15000 }];
    expect(computeBalanceOwingCents(10000, payments)).toBe(0);
  });

  it("a full refund of a paid deposit restores the full balance owing (regression guard)", () => {
    const payments: PaymentForBalance[] = [
      { status: "PAID", type: "DEPOSIT", amountCents: 10000 },
      { status: "PAID", type: "REFUND", amountCents: 10000 },
    ];
    // Must be exactly the original total — not 10000 + 10000 = 20000 (the
    // double-counting bug) and not 0 (treating the refund as if it never
    // happened).
    expect(computeBalanceOwingCents(10000, payments)).toBe(10000);
  });

  it("a partial refund restores only the refunded portion", () => {
    const payments: PaymentForBalance[] = [
      { status: "PAID", type: "FULL", amountCents: 10000 },
      { status: "PAID", type: "REFUND", amountCents: 3000 },
    ];
    expect(computeBalanceOwingCents(10000, payments)).toBe(3000);
  });

  it("handles a deposit, a balance payment, and a partial refund together", () => {
    const payments: PaymentForBalance[] = [
      { status: "PAID", type: "DEPOSIT", amountCents: 2000 },
      { status: "PAID", type: "BALANCE", amountCents: 8000 },
      { status: "PAID", type: "REFUND", amountCents: 2500 },
    ];
    expect(computeBalanceOwingCents(10000, payments)).toBe(2500);
  });

  it("does not let an unrelated PENDING balance payment mask a refund that reopened the balance", () => {
    const payments: PaymentForBalance[] = [
      { status: "PAID", type: "FULL", amountCents: 10000 },
      { status: "PAID", type: "REFUND", amountCents: 10000 },
      { status: "PENDING", type: "BALANCE", amountCents: 10000 }, // e.g. an expired retry checkout
    ];
    expect(computeBalanceOwingCents(10000, payments)).toBe(10000);
  });

  it("treats a service with a zero price (comped/inspection-only) as nothing owing", () => {
    expect(computeBalanceOwingCents(0, [])).toBe(0);
  });
});
