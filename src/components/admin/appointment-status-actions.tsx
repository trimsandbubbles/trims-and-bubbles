"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { updateAppointmentStatus } from "@/lib/actions/admin-appointments";
import { runAction } from "@/lib/run-action";

/** Common, plain-English reasons the owner can pick from instead of typing a
 * reason from scratch every time — with an optional free-text box for
 * anything more specific. Mirrors how Fresha/Rover/MoeGo structure
 * cancellation reasons. */
const CANCEL_REASONS = ["Owner unavailable", "Dog unwell", "Customer request", "Other"] as const;

export function AppointmentStatusActions({ appointmentId, status }: { appointmentId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelReason, setCancelReason] = useState<string>("");
  const [cancelDetail, setCancelDetail] = useState("");

  function setStatus(next: string) {
    startTransition(async () => {
      await runAction(() => updateAppointmentStatus(appointmentId, next), {
        success: "Updated",
        onSuccess: () => router.refresh(),
      });
    });
  }

  function resetCancelForm() {
    setCancelReason("");
    setCancelDetail("");
  }

  async function handleConfirmCancel() {
    const detail = cancelDetail.trim();
    let reason = "";
    if (cancelReason === "Other") {
      reason = detail || "Other";
    } else if (cancelReason) {
      reason = detail ? `${cancelReason} — ${detail}` : cancelReason;
    } else {
      reason = detail;
    }
    await runAction(() => updateAppointmentStatus(appointmentId, "CANCELLED", reason || undefined), {
      success: "Appointment cancelled",
      onSuccess: () => {
        resetCancelForm();
        router.refresh();
      },
    });
  }

  if (status === "COMPLETED" || status === "CANCELLED" || status === "NO_SHOW") return null;

  return (
    // The cancel button is kept spatially separated from — and visually
    // heavier than — the benign status actions, per NN Group guidance on not
    // placing a consequential action next to routine ones.
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        {status === "PENDING_PAYMENT" && (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setStatus("CONFIRMED")}>
            <CheckCircle2 className="h-4 w-4" /> Confirm
          </Button>
        )}
        {status !== "IN_PROGRESS" && (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setStatus("IN_PROGRESS")}>
            <PlayCircle className="h-4 w-4" /> Mark in progress
          </Button>
        )}
      </div>
      <ConfirmDialog
        trigger={
          <Button variant="destructive" size="sm" disabled={pending} onClick={resetCancelForm}>
            <Ban className="h-4 w-4" /> Cancel appointment
          </Button>
        }
        title="Cancel this appointment?"
        description={
          <span className="flex flex-col gap-3">
            <span className="block text-foreground">
              This frees up the time slot and lets you (optionally) note why it fell through.
            </span>
            <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
              Reason (optional)
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">No reason given</option>
                {CANCEL_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
              Add detail (optional)
              <input
                type="text"
                value={cancelDetail}
                onChange={(e) => setCancelDetail(e.target.value)}
                placeholder="e.g. Called to reschedule for next week"
                maxLength={200}
                className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </label>
          </span>
        }
        confirmLabel="Yes, cancel it"
        cancelLabel="Keep appointment"
        variant="destructive"
        onConfirm={handleConfirmCancel}
      />
    </div>
  );
}
