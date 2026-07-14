"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { rescheduleAppointment } from "@/lib/actions/admin-appointments";

type SlotDTO = { startAt: string; endAt: string };
type FetchResult = { paramsKey: string; slots: SlotDTO[] } | { paramsKey: string; failed: true };

const TIME_FMT = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" });

/** Local calendar-day components (not UTC) — preserves "the day she clicked". */
function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Owner-facing "change the time" flow: pick a new date, then an actually-free
 * slot (fetched from the same /api/availability the booking wizard uses, so
 * only genuine openings show), and move the appointment there.
 */
export function RescheduleDialog({
  appointmentId,
  serviceId,
  addOnIds,
}: {
  appointmentId: string;
  serviceId: string;
  addOnIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [chosenStart, setChosenStart] = useState<string | null>(null);
  const [result, setResult] = useState<FetchResult | null>(null);
  const [pending, setPending] = useState(false);

  const dateStr = selectedDate ? toDateStr(selectedDate) : null;
  const addOnKey = addOnIds.join(",");
  const paramsKey = dateStr ? `${dateStr}|${serviceId}|${addOnKey}` : null;

  useEffect(() => {
    if (!open || !dateStr) return;
    const currentParamsKey = `${dateStr}|${serviceId}|${addOnKey}`;
    let cancelled = false;

    const params = new URLSearchParams({ date: dateStr, serviceId });
    if (addOnKey) params.set("addOnIds", addOnKey);

    fetch(`/api/availability?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Request failed");
        return res.json();
      })
      .then((data: { slots: SlotDTO[] }) => {
        if (!cancelled) setResult({ paramsKey: currentParamsKey, slots: data.slots });
      })
      .catch(() => {
        if (!cancelled) setResult({ paramsKey: currentParamsKey, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [open, dateStr, serviceId, addOnKey]);

  const currentResult = result && result.paramsKey === paramsKey ? result : null;
  const loading = !!paramsKey && !currentResult;
  const errored = !!currentResult && "failed" in currentResult && currentResult.failed;
  const slots = currentResult && "slots" in currentResult ? currentResult.slots : [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today.getTime() + 60 * 24 * 60 * 60_000);

  async function handleConfirm() {
    if (!chosenStart) return;
    setPending(true);
    const res = await rescheduleAppointment(appointmentId, chosenStart);
    setPending(false);
    if (res.status === "success") {
      toast.success("Appointment moved");
      setOpen(false);
      setSelectedDate(undefined);
      setChosenStart(null);
      setResult(null);
      router.refresh();
    } else {
      toast.error(res.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <CalendarClock className="h-4 w-4" /> Reschedule
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change the time</DialogTitle>
          <DialogDescription>Pick a new date, then an available time. The customer will be emailed the new details.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              setSelectedDate(date);
              setChosenStart(null);
            }}
            disabled={(date) => date < today || date > maxDate}
            className="mx-auto rounded-xl border border-border"
          />

          <div className="min-h-[3rem]">
            {!selectedDate && <p className="text-sm text-muted-foreground">Pick a date to see available times.</p>}

            {selectedDate && loading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking availability...
              </p>
            )}

            {selectedDate && !loading && errored && (
              <p className="text-sm text-destructive">Couldn&apos;t load times — please try another date.</p>
            )}

            {selectedDate && !loading && !errored && slots.length === 0 && (
              <p className="text-sm text-muted-foreground">No openings that day — try another date.</p>
            )}

            {selectedDate && !loading && !errored && slots.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((slot) => {
                  const isSelected = chosenStart === slot.startAt;
                  return (
                    <button
                      key={slot.startAt}
                      type="button"
                      onClick={() => setChosenStart(slot.startAt)}
                      className={cn(
                        "min-h-11 rounded-lg border px-2 py-2 text-sm tabular-nums transition-colors",
                        isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                      )}
                    >
                      {TIME_FMT.format(new Date(slot.startAt))}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Button className="w-full" size="lg" disabled={!chosenStart || pending} onClick={handleConfirm}>
            {pending ? "Moving..." : "Confirm new time"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
