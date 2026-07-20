"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { runAction } from "@/lib/run-action";
import { addAvailabilityException, deleteAvailabilityException } from "@/lib/actions/availability-admin";

export type ExceptionDTO = {
  id: string;
  date: string; // YYYY-MM-DD
  type: "CLOSED" | "CUSTOM_HOURS";
  customStartTime: string | null;
  customEndTime: string | null;
  reason: string | null;
};

export function ExceptionsEditor({ initialExceptions }: { initialExceptions: ExceptionDTO[] }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [type, setType] = useState<"CLOSED" | "CUSTOM_HOURS">("CLOSED");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  // The list itself is server-fetched (real IDs, sorted) and passed down as a
  // prop; a successful add/delete just asks the server component to refetch
  // rather than hand-reconciling local state (which would need a fake ID for
  // brand-new rows until the next real fetch anyway).
  function handleAdd() {
    if (!date) {
      toast.error("Pick a date first");
      return;
    }
    startTransition(async () => {
      await runAction(
        () =>
          addAvailabilityException({
            date,
            type,
            customStartTime: type === "CUSTOM_HOURS" ? startTime : undefined,
            customEndTime: type === "CUSTOM_HOURS" ? endTime : undefined,
            reason: reason || undefined,
          }),
        {
          success: "Saved",
          onSuccess: () => {
            setDate("");
            setReason("");
            router.refresh();
          },
        },
      );
    });
  }

  async function handleDeleteConfirmed(id: string) {
    await runAction(() => deleteAvailabilityException(id), {
      success: "Removed",
      onSuccess: () => router.refresh(),
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <h3 className="text-sm font-semibold">Days off &amp; different hours</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        For public holidays, a day off, or hours that differ from your usual week.
      </p>

      {initialExceptions.length > 0 && (
        <ul className="mt-4 space-y-2">
          {initialExceptions.map((exception) => {
            const label = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(
              new Date(`${exception.date}T00:00:00`),
            );
            return (
              <li key={exception.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">{label}</span>{" "}
                  <span className="text-muted-foreground">
                    {exception.type === "CLOSED" ? "— Closed" : `— ${exception.customStartTime}–${exception.customEndTime}`}
                    {exception.reason ? ` (${exception.reason})` : ""}
                  </span>
                </div>
                <ConfirmDialog
                  trigger={
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Remove"
                      disabled={pending}
                      className="gap-1.5 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" /> Remove
                    </Button>
                  }
                  title={`Remove the closure on ${label}?`}
                  description="That day will be open for bookings again."
                  confirmLabel="Remove closure"
                  cancelLabel="Keep closure"
                  variant="destructive"
                  onConfirm={() => handleDeleteConfirmed(exception.id)}
                />
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="exception-date">Date</Label>
          <Input id="exception-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exception-type">Type</Label>
          <select
            id="exception-type"
            value={type}
            onChange={(e) => setType(e.target.value as "CLOSED" | "CUSTOM_HOURS")}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="CLOSED">Closed all day</option>
            <option value="CUSTOM_HOURS">Custom hours</option>
          </select>
        </div>
        {type === "CUSTOM_HOURS" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="exception-start">Opens</Label>
              <Input id="exception-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exception-end">Closes</Label>
              <Input id="exception-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="exception-reason">Reason (optional)</Label>
          <Input id="exception-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Public holiday" />
        </div>
      </div>
      <Button onClick={handleAdd} disabled={pending} className="mt-4">
        {pending ? "Saving..." : "Add"}
      </Button>
    </div>
  );
}
