"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";

export type ChosenSlot = { dateStr: string; startAt: string; endAt: string };

type SlotDTO = { startAt: string; endAt: string };
type HoursDTO = {
  closed: boolean;
  windows: { start: string; end: string }[];
  totalBookableMinutes: number;
  longestWindowMinutes: number;
  betterWeekdays: number[];
};
type FetchResult =
  | { paramsKey: string; slots: SlotDTO[]; booked: SlotDTO[]; hours: HoursDTO | null }
  | { paramsKey: string; failed: true };

const TIME_FMT = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" });
const WEEKDAY_FMT = new Intl.DateTimeFormat("en-AU", { weekday: "long" });
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Local calendar-day components (not UTC) — preserves "the day the user
 * clicked" regardless of the browser's timezone offset from UTC. */
function toDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "16:00" -> "4:00pm". These are plain wall-clock business hours (no date or
 * timezone attached), so this is pure string formatting, not a TZ conversion. */
function formatWallClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${period}`;
}

function formatWindows(windows: { start: string; end: string }[]): string {
  return windows.map((w) => `${formatWallClock(w.start)}–${formatWallClock(w.end)}`).join(", ");
}

function listDayNames(dayIndexes: number[]): string {
  const names = dayIndexes.map((i) => WEEKDAY_NAMES[i]);
  return new Intl.ListFormat("en-AU", { style: "long", type: "conjunction" }).format(names);
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
      .then((data: { slots: SlotDTO[]; booked?: SlotDTO[]; hours?: HoursDTO }) => {
        if (!cancelled) {
          setResult({
            paramsKey: currentParamsKey,
            slots: data.slots,
            booked: data.booked ?? [],
            hours: data.hours ?? null,
          });
        }
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
  const hours = currentResult && "hours" in currentResult ? currentResult.hours : null;
  // One merged, time-ordered grid: open times are clickable, taken times show
  // as greyed-out "Booked" so it's obvious why a time isn't offered.
  const gridSlots = [
    ...slots.map((s) => ({ ...s, booked: false })),
    ...bookedSlots.map((s) => ({ ...s, booked: true })),
  ].sort((a, b) => a.startAt.localeCompare(b.startAt));

  const dayName = selectedDate ? WEEKDAY_FMT.format(selectedDate) : "";
  const openWeekdayIndexes = [0, 1, 2, 3, 4, 5, 6].filter((d) => !closedWeekdays.includes(d));
  const closed = hours?.closed ?? false;
  // Most "closed" days are the recurring weekly pattern; occasionally a
  // normally-open day is closed just for that date (a holiday-style
  // exception) — worded differently so we don't imply every $dayName is off.
  const closedByWeeklyPattern = selectedDate ? closedWeekdays.includes(selectedDate.getDay()) : false;
  const fitsInADay = hours ? durationMinutes <= hours.longestWindowMinutes : true;
  const hasOpenSlots = slots.length > 0;

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
        {durationMinutes > 0 && (
          <p className="mb-3 text-sm font-medium">This booking needs {formatDuration(durationMinutes)} total.</p>
        )}

        {!selectedDate && <p className="text-sm text-muted-foreground">Pick a date to see available times.</p>}

        {selectedDate && loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking availability...
          </p>
        )}

        {selectedDate && !loading && errored && (
          <p className="text-sm text-destructive">Couldn&apos;t load times — please try another date.</p>
        )}

        {selectedDate && !loading && !errored && closed && closedByWeeklyPattern && (
          <p className="text-sm text-muted-foreground">
            We&apos;re closed on {dayName}s. We&apos;re open {listDayNames(openWeekdayIndexes)} — try one of those
            instead.
          </p>
        )}

        {selectedDate && !loading && !errored && closed && !closedByWeeklyPattern && (
          <p className="text-sm text-muted-foreground">
            We&apos;re closed that day. We&apos;re open {listDayNames(openWeekdayIndexes)} — try one of those instead.
          </p>
        )}

        {selectedDate && !loading && !errored && !closed && hours && !fitsInADay && (
          <p className="text-sm text-muted-foreground">
            This booking needs {formatDuration(durationMinutes)} together. {dayName}s we&apos;re open{" "}
            {formatWindows(hours.windows)} ({formatDuration(hours.longestWindowMinutes)}), so it needs a longer day than
            this.{" "}
            {hours.betterWeekdays.length > 0 ? (
              <>
                Try {hours.betterWeekdays.length === 1 ? "a " : ""}
                {listDayNames(hours.betterWeekdays)} instead.
              </>
            ) : (
              "Try picking a shorter service, or splitting it into two visits."
            )}
          </p>
        )}

        {selectedDate && !loading && !errored && !closed && hours && fitsInADay && !hasOpenSlots && (
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {dayName}s we&apos;re open {formatWindows(hours.windows)}.
            </p>
            <p className="text-sm text-muted-foreground">
              That day&apos;s taken. Your {formatDuration(durationMinutes)} doesn&apos;t fit around what&apos;s already
              booked — try another date, or pick a shorter service.
            </p>
          </div>
        )}

        {selectedDate && !loading && !errored && !closed && hours && hasOpenSlots && (
          <p className="mb-2 text-sm text-muted-foreground">
            {dayName}s we&apos;re open {formatWindows(hours.windows)}.
          </p>
        )}

        {/* Defensive fallback: an older/odd API response without `hours`. */}
        {selectedDate && !loading && !errored && !hours && gridSlots.length === 0 && (
          <p className="text-sm text-muted-foreground">No openings that day — try another date.</p>
        )}

        {selectedDate && !loading && !errored && hasOpenSlots && (
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
