"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export type ChosenSlot = { dateStr: string; startAt: string; endAt: string };

type SlotDTO = { startAt: string; endAt: string };
type FetchResult = { paramsKey: string; slots: SlotDTO[] } | { paramsKey: string; failed: true };

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
  serviceId,
  addOnIds,
  closedWeekdays,
  value,
  onChange,
}: {
  serviceId: string;
  addOnIds: string[];
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
  const addOnKey = addOnIds.join(",");
  const paramsKey = dateStr ? `${dateStr}|${serviceId}|${addOnKey}` : null;

  useEffect(() => {
    if (!dateStr) return;
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
  }, [dateStr, serviceId, addOnKey]);

  const currentResult = result && result.paramsKey === paramsKey ? result : null;
  const loading = !!paramsKey && !currentResult;
  const errored = !!currentResult && "failed" in currentResult && currentResult.failed;
  const slots = currentResult && "slots" in currentResult ? currentResult.slots : [];

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

        {selectedDate && !loading && !errored && slots.length === 0 && (
          <p className="text-sm text-muted-foreground">No openings that day — try another date.</p>
        )}

        {selectedDate && !loading && !errored && slots.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((slot) => {
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
