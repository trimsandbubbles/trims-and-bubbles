"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export type ChosenSlot = { dateStr: string; startAt: string; endAt: string };

type SlotDTO = { startAt: string; endAt: string };
type FetchResult =
  | { paramsKey: string; slots: SlotDTO[]; booked: SlotDTO[] }
  | { paramsKey: string; failed: true };

const TIME_FMT = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" });

/** Local calendar-day components (not UTC) — preserves "the day the user
 * clicked" regardless of the browser's timezone offset from UTC. */
function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function TimeSlotPicker({
  durationMinutes,
  closedWeekdays,
  value,
  onChange,
}: {
  durationMinutes: number;
  closedWeekdays: number[];
  value: ChosenSlot | null;
  onChange: (slot: ChosenSlot) => void;
}) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    value ? new Date(`${value.dateStr}T00:00:00`) : undefined,
  );
  // Keyed by the exact params it was fetched for, so "loading"/"errored" are
  // derived by comparing keys during render rather than tracked as separate
  // state set synchronously inside the effect (avoids an extra render pass).
  const [result, setResult] = useState<FetchResult | null>(null);

  const dateStr = selectedDate ? toDateStr(selectedDate) : null;
  const paramsKey = dateStr ? `${dateStr}|${durationMinutes}` : null;

  useEffect(() => {
    if (!dateStr) return;
    const currentParamsKey = `${dateStr}|${durationMinutes}`;
    let cancelled = false;

    const params = new URLSearchParams({ date: dateStr, durationMinutes: String(durationMinutes) });

    fetch(`/api/availability?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Request failed");
        return res.json();
      })
      .then((data: { slots: SlotDTO[]; booked?: SlotDTO[] }) => {
        if (!cancelled) setResult({ paramsKey: currentParamsKey, slots: data.slots, booked: data.booked ?? [] });
      })
      .catch(() => {
        if (!cancelled) setResult({ paramsKey: currentParamsKey, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [dateStr, durationMinutes]);

  const currentResult = result && result.paramsKey === paramsKey ? result : null;
  const loading = !!paramsKey && !currentResult;
  const errored = !!currentResult && "failed" in currentResult && currentResult.failed;
  const slots = currentResult && "slots" in currentResult ? currentResult.slots : [];
  const bookedSlots = currentResult && "booked" in currentResult ? currentResult.booked : [];
  // One merged, time-ordered grid: open times are clickable, taken times show
  // as greyed-out "Booked" so it's obvious why a time isn't offered.
  const gridSlots = [
    ...slots.map((s) => ({ ...s, booked: false })),
    ...bookedSlots.map((s) => ({ ...s, booked: true })),
  ].sort((a, b) => a.startAt.localeCompare(b.startAt));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today.getTime() + 60 * 24 * 60 * 60_000);

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-[auto_1fr]">
      <Calendar
        mode="single"
        selected={selectedDate}
        onSelect={setSelectedDate}
        disabled={(date) => date < today || date > maxDate || closedWeekdays.includes(date.getDay())}
        className="rounded-xl border border-border"
      />

      <div className="min-w-0">
        {!selectedDate && <p className="text-sm text-muted-foreground">Pick a date to see available times.</p>}

        {selectedDate && loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking availability...
          </p>
        )}

        {selectedDate && !loading && errored && (
          <p className="text-sm text-destructive">Couldn&apos;t load times — please try another date.</p>
        )}

        {selectedDate && !loading && !errored && gridSlots.length === 0 && (
          <p className="text-sm text-muted-foreground">No openings that day — try another date.</p>
        )}

        {selectedDate && !loading && !errored && gridSlots.length > 0 && slots.length === 0 && (
          <p className="mb-3 text-sm text-muted-foreground">That day is fully booked — try another date.</p>
        )}

        {selectedDate && !loading && !errored && gridSlots.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {gridSlots.map((slot) => {
              if (slot.booked) {
                return (
                  <div
                    key={slot.startAt}
                    aria-disabled="true"
                    className="flex flex-col items-center rounded-lg border border-dashed border-border bg-muted/50 px-2 py-1 text-sm tabular-nums text-muted-foreground/70"
                  >
                    <span className="line-through">{TIME_FMT.format(new Date(slot.startAt))}</span>
                    <span className="text-[10px] uppercase tracking-wide">Booked</span>
                  </div>
                );
              }
              const isSelected = value?.startAt === slot.startAt;
              return (
                <button
                  key={slot.startAt}
                  type="button"
                  onClick={() => onChange({ dateStr: toDateStr(selectedDate), startAt: slot.startAt, endAt: slot.endAt })}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-sm tabular-nums transition-colors",
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
    </div>
  );
}
