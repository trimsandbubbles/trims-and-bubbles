"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CheckCircle2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateAppointmentStatus } from "@/lib/actions/admin-appointments";

export function AppointmentStatusActions({ appointmentId, status }: { appointmentId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setStatus(next: string, cancelReason?: string) {
    startTransition(async () => {
      const result = await updateAppointmentStatus(appointmentId, next, cancelReason);
      if (result.status === "success") {
        toast.success("Updated");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleCancel() {
    if (!window.confirm("Cancel this appointment?")) return;
    const reason = window.prompt("Reason (optional):", "") ?? "";
    setStatus("CANCELLED", reason);
  }

  if (status === "COMPLETED" || status === "CANCELLED" || status === "NO_SHOW") return null;

  return (
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
      <Button variant="outline" size="sm" disabled={pending} onClick={handleCancel} className="text-destructive hover:text-destructive">
        <Ban className="h-4 w-4" /> Cancel
      </Button>
    </div>
  );
}
