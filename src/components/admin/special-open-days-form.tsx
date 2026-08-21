"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SlotRows, validateSlots, type TimeWindow } from "@/components/admin/slot-rows";
import { runAction } from "@/lib/run-action";
import { createSpecialOpenDays, clearExceptionsInRange } from "@/lib/actions/availability-admin";

/** Default "full day open" — hourly drop-off slots 8am–5pm. */
const DEFAULT_SLOTS: TimeWindow[] = Array.from({ length: 9 }, (_, i) => {
  const h = 8 + i;
  return { startTime: `${String(h).padStart(2, "0")}:00`, endTime: `${String(h + 1).padStart(2, "0")}:00` };
});

export function SpecialOpenDaysForm() {
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [slots, setSlots] = useState<TimeWindow[]>(DEFAULT_SLOTS);
  const [pending, startTransition] = useTransition();

  function handleCreate() {
    if (!startDate || !endDate) return toast.error("Pick a start and end date.");
    if (slots.length === 0) return toast.error("Add at least one drop-off time.");
    const err = validateSlots(slots, "The drop-off times");
    if (err) return toast.error(err);
    startTransition(async () => {
      await runAction(() => createSpecialOpenDays({ startDate, endDate, slots }), {
        success: "Special open days added — they'll show on the booking page.",
        onSuccess: () => router.refresh(),
      });
    });
  }

  function handleClear() {
    if (!startDate || !endDate) {
      toast.error("Enter the start and end date to clear.");
      return;
    }
    startTransition(async () => {
      await runAction(() => clearExceptionsInRange(startDate, endDate), {
        success: "Those dates were cleared.",
        onSuccess: () => router.refresh(),
      });
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" /> Special open days
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Open a one-off stretch of days (like a holiday) with extra drop-off slots — <strong>without</strong> changing your
        usual weekly hours. These show as a highlight on the booking page, and customers can book them straight away.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="special-start">From</Label>
          <Input id="special-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="special-end">To</Label>
          <Input id="special-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <Label>Drop-off times (applied to every day in the range)</Label>
        <p className="text-xs text-muted-foreground">Starts at hourly 8am–5pm for a full day — add or remove any.</p>
        <SlotRows slots={slots} onChange={setSlots} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={handleCreate} disabled={pending}>
          {pending ? "Saving..." : "Open these days"}
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant="outline" disabled={pending}>
              Clear these dates
            </Button>
          }
          title="Clear one-off days in this range?"
          description="This removes any special open days (and other one-off overrides) for the From–To dates above. Your normal weekly schedule isn't affected."
          confirmLabel="Clear the dates"
          cancelLabel="Keep them"
          variant="destructive"
          onConfirm={handleClear}
        />
      </div>
    </div>
  );
}
