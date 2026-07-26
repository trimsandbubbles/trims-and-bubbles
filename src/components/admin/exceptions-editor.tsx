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
import { SlotRows, validateSlots, type TimeWindow } from "@/components/admin/slot-rows";

type ExceptionType = "CLOSED" | "CUSTOM_HOURS" | "CUSTOM_SLOTS";

export type ExceptionDTO = {
  id: string;
  date: string; // YYYY-MM-DD
  type: ExceptionType;
  customStartTime: string | null;
  customEndTime: string | null;
  customSlots: TimeWindow[] | null;
  reason: string | null;
};

function friendlyTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, "0")}${period}`;
}

/** One-line summary of what an exception does, for the saved list. */
function summarise(exception: ExceptionDTO): string {
  if (exception.type === "CLOSED") return "Closed";
  if (exception.type === "CUSTOM_SLOTS") {
    const times = (exception.customSlots ?? []).map((s) => friendlyTime(s.startTime)).join(", ");
    return `Drop-off slots: ${times || "—"}`;
  }
  return `${exception.customStartTime}–${exception.customEndTime}`;
}

export function ExceptionsEditor({ initialExceptions }: { initialExceptions: ExceptionDTO[] }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [type, setType] = useState<ExceptionType>("CLOSED");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [slots, setSlots] = useState<TimeWindow[]>([{ startTime: "13:00", endTime: "14:00" }]);
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
    if (type === "CUSTOM_HOURS" && endTime <= startTime) {
      toast.error("The finish time must be after the start time.");
      return;
    }
    if (type === "CUSTOM_SLOTS") {
      if (slots.length === 0) {
        toast.error("Add at least one drop-off time.");
        return;
      }
      const err = validateSlots(slots, "That date");
      if (err) {
        toast.error(err);
        return;
      }
    }
    startTransition(async () => {
      await runAction(
        () =>
          addAvailabilityException({
            date,
            type,
            customStartTime: type === "CUSTOM_HOURS" ? startTime : undefined,
            customEndTime: type === "CUSTOM_HOURS" ? endTime : undefined,
            customSlots: type === "CUSTOM_SLOTS" ? slots : undefined,
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
      <h3 className="text-sm font-semibold">One-off days: closures, different hours &amp; special slots</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        For a single date that differs from your usual week — a public holiday closure, one-off hours, or a special set
        of drop-off times just for that day.
      </p>

      {initialExceptions.length > 0 && (
        <ul className="mt-4 space-y-2">
          {initialExceptions.map((exception) => {
            const label = new Intl.DateTimeFormat("en-AU", {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            }).format(new Date(`${exception.date}T00:00:00`));
            return (
              <li
                key={exception.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{label}</span>{" "}
                  <span className="text-muted-foreground">
                    — {summarise(exception)}
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
                  title={`Remove the override on ${label}?`}
                  description="That day will go back to your usual weekly schedule."
                  confirmLabel="Remove"
                  cancelLabel="Keep it"
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
          <Label htmlFor="exception-type">What happens that day</Label>
          <select
            id="exception-type"
            value={type}
            onChange={(e) => setType(e.target.value as ExceptionType)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="CLOSED">Closed all day</option>
            <option value="CUSTOM_HOURS">Open different hours</option>
            <option value="CUSTOM_SLOTS">Special drop-off slots</option>
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
        {type === "CUSTOM_SLOTS" && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Drop-off times for this date</Label>
            <SlotRows slots={slots} onChange={setSlots} />
            <p className="text-xs text-muted-foreground">One booking per slot, just like your weekly drop-off slots.</p>
          </div>
        )}
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="exception-reason">Reason (optional)</Label>
          <Input
            id="exception-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Public holiday"
          />
        </div>
      </div>
      <Button onClick={handleAdd} disabled={pending} className="mt-4">
        {pending ? "Saving..." : "Add"}
      </Button>
    </div>
  );
}
