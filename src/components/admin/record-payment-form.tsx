"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordManualPayment } from "@/lib/actions/admin-appointments";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function RecordPaymentForm({
  appointmentId,
  status,
  depositPriceCents,
  balanceOwingCents,
}: {
  appointmentId: string;
  status: string;
  depositPriceCents: number | null;
  balanceOwingCents: number;
}) {
  const router = useRouter();
  // A PENDING_PAYMENT appointment hasn't had its deposit collected yet, so
  // that's the more useful default — recording a "balance" here wouldn't
  // confirm the booking. Once the deposit's in, later payments are balances.
  const defaultIsDeposit = status === "PENDING_PAYMENT" && !!depositPriceCents;
  const [type, setType] = useState<"DEPOSIT" | "BALANCE" | "FULL">(defaultIsDeposit ? "DEPOSIT" : "BALANCE");
  const [method, setMethod] = useState<"CASH" | "OTHER">("CASH");
  const [amount, setAmount] = useState(((defaultIsDeposit ? depositPriceCents! : balanceOwingCents) / 100).toFixed(2));
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = Math.round(Number(amount) * 100);
    if (!amountCents || amountCents <= 0) {
      toast.error("Enter an amount greater than $0");
      return;
    }
    startTransition(async () => {
      const result = await recordManualPayment({ appointmentId, type, amountCents, method });
      if (result.status === "success") {
        toast.success("Payment recorded");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-4 sm:items-end">
      <div className="space-y-1.5">
        <Label htmlFor="payment-amount">Amount ($)</Label>
        <Input id="payment-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="payment-type">Type</Label>
        <select id="payment-type" value={type} onChange={(e) => setType(e.target.value as typeof type)} className={selectClass}>
          <option value="DEPOSIT">Deposit</option>
          <option value="BALANCE">Balance</option>
          <option value="FULL">Full payment</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="payment-method">Method</Label>
        <select id="payment-method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={selectClass}>
          <option value="CASH">Cash</option>
          <option value="OTHER">Other (EFTPOS, transfer...)</option>
        </select>
      </div>
      <Button type="submit" disabled={pending} variant="outline">
        {pending ? "Recording..." : "Record payment"}
      </Button>
    </form>
  );
}
