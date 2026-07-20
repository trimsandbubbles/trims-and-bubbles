"use client";

import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cancelMyAppointment } from "@/lib/actions/client-appointments";
import { runAction } from "@/lib/run-action";

const WHEN_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
});

export function CancelBookingButton({
  appointmentId,
  dogCount,
  petName,
  serviceName,
  startAt,
  size = "default",
  className,
}: {
  appointmentId: string;
  dogCount: number;
  petName: string;
  serviceName: string;
  startAt: Date;
  size?: "default" | "touch";
  className?: string;
}) {
  const router = useRouter();

  async function handleConfirm() {
    // `runAction` toasts on both success and failure and never throws, so
    // this component doesn't need its own try/catch or error toast.
    await runAction(() => cancelMyAppointment({ appointmentId }), {
      success: "Your booking has been cancelled.",
      onSuccess: () => router.refresh(),
    });
  }

  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive" size={size} className={className}>
          <XCircle className="h-4 w-4" /> Cancel booking
        </Button>
      }
      title={`Cancel ${petName}'s ${serviceName}?`}
      description={
        <>
          This booking is for {WHEN_FMT.format(startAt)}.{" "}
          {dogCount > 1
            ? `This cancels the whole booking, for all ${dogCount} dogs.`
            : "We'll let the salon know right away."}
        </>
      }
      confirmLabel="Yes, cancel it"
      cancelLabel="Keep booking"
      variant="destructive"
      onConfirm={handleConfirm}
    />
  );
}
