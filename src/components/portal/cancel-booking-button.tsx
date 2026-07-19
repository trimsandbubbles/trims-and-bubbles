"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelMyAppointment } from "@/lib/actions/client-appointments";

export function CancelBookingButton({ appointmentId, dogCount }: { appointmentId: string; dogCount: number }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    const msg =
      dogCount > 1
        ? `Cancel this booking for all ${dogCount} dogs? We'll let the salon know.`
        : "Cancel this booking? We'll let the salon know.";
    if (!confirm(msg)) return;
    startTransition(async () => {
      const result = await cancelMyAppointment({ appointmentId });
      if (result.status === "success") {
        toast.success("Your booking has been cancelled.");
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Button variant="destructive" size="sm" disabled={pending} onClick={handleClick}>
      <XCircle className="h-4 w-4" /> {pending ? "Cancelling…" : "Cancel booking"}
    </Button>
  );
}
