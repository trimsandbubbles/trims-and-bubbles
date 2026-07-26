"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { runAction } from "@/lib/run-action";
import { saveWeeklyAvailability } from "@/lib/actions/availability-admin";
import { SlotRows, validateSlots, type TimeWindow } from "@/components/admin/slot-rows";

/**
 * A day is in one of three states — this is the whole "how do I open, restrict,
 * or close a day" model in one control:
 *   OPEN_HOURS  – open across time ranges; the system offers start times across them.
 *   FIXED_SLOTS – only the exact drop-off times you list; one booking per slot.
 *   CLOSED      – shut all day; customers can't book at all.
 */
type DayState = "OPEN_HOURS" | "FIXED_SLOTS" | "CLOSED";

type DayRow = {
  dayOfWeek: number;
  label: string;
  state: DayState;
  windows: TimeWindow[];
  slots: TimeWindow[];
};

const DAY_ORDER: { dayOfWeek: number; label: string }[] = [
  { dayOfWeek: 1, label: "Monday" },
  { dayOfWeek: 2, label: "Tuesday" },
  { dayOfWeek: 3, label: "Wednesday" },
  { dayOfWeek: 4, label: "Thursday" },
  { dayOfWeek: 5, label: "Friday" },
  { dayOfWeek: 6, label: "Saturday" },
  { dayOfWeek: 0, label: "Sunday" },
];

const MAX_WINDOWS = 4;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Open-hours ranges must be ordered and non-overlapping — mirrors the server. */
function findWindowError(ranges: TimeWindow[], dayLabel: string): string | null {
  const sorted = [...ranges].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (const r of sorted) {
    if (r.endTime <= r.startTime) return `${dayLabel}: each time range's finish must be after its start.`;
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startTime < sorted[i - 1].endTime) {
      return `${dayLabel}: the time ranges overlap — adjust them so they don't.`;
    }
  }
  return null;
}

export function AvailabilityEditor({
  initialRules,
  initialModes,
  initialFixedSlots,
}: {
  initialRules: { dayOfWeek: number; isActive: boolean; startTime: string; endTime: string }[];
  initialModes: { dayOfWeek: number; mode: "OPEN_HOURS" | "FIXED_SLOTS" }[];
  initialFixedSlots: { dayOfWeek: number; startTime: string; endTime: string }[];
}) {
  const [rows, setRows] = useState<DayRow[]>(() =>
    DAY_ORDER.map(({ dayOfWeek, label }) => {
      const dayRules = initialRules
        .filter((r) => r.dayOfWeek === dayOfWeek)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      const daySlots = initialFixedSlots
        .filter((s) => s.dayOfWeek === dayOfWeek)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      const mode = initialModes.find((m) => m.dayOfWeek === dayOfWeek)?.mode ?? "OPEN_HOURS";
      const hasActiveWindow = dayRules.some((r) => r.isActive);

      // Work out which of the three states the day is currently in. Open-hours
      // rows and fixed slots are BOTH kept (even when inactive) so switching a
      // day's state back and forth never loses the times that were typed in.
      let state: DayState;
      if (mode === "FIXED_SLOTS") state = daySlots.length > 0 ? "FIXED_SLOTS" : "CLOSED";
      else state = hasActiveWindow ? "OPEN_HOURS" : "CLOSED";

      return {
        dayOfWeek,
        label,
        state,
        windows: dayRules.length
          ? dayRules.map((r) => ({ startTime: r.startTime, endTime: r.endTime }))
          : [{ startTime: "09:00", endTime: "17:00" }],
        slots: daySlots.map((s) => ({ startTime: s.startTime, endTime: s.endTime })),
      };
    }),
  );
  const [pending, startTransition] = useTransition();

  function updateRow(dayOfWeek: number, patch: Partial<DayRow>) {
    setRows((prev) => prev.map((r) => (r.dayOfWeek === dayOfWeek ? { ...r, ...patch } : r)));
  }

  // ── Open-hours windows ────────────────────────────────────────────────────
  function updateWindow(dayOfWeek: number, index: number, patch: Partial<TimeWindow>) {
    setRows((prev) =>
      prev.map((r) =>
        r.dayOfWeek === dayOfWeek
          ? { ...r, windows: r.windows.map((w, i) => (i === index ? { ...w, ...patch } : w)) }
          : r,
      ),
    );
  }
  function addWindow(day: DayRow) {
    if (day.windows.length >= MAX_WINDOWS) return;
    const last = day.windows[day.windows.length - 1];
    const [h] = last.endTime.split(":").map(Number);
    const startH = Math.min(h + 1, 22);
    updateRow(day.dayOfWeek, {
      windows: [...day.windows, { startTime: `${pad(startH)}:00`, endTime: `${pad(Math.min(startH + 3, 23))}:00` }],
    });
  }
  function removeWindow(day: DayRow, index: number) {
    if (day.windows.length <= 1) return;
    updateRow(day.dayOfWeek, { windows: day.windows.filter((_, i) => i !== index) });
  }

  function handleSave() {
    for (const row of rows) {
      if (row.state === "OPEN_HOURS") {
        const err = findWindowError(row.windows, row.label);
        if (err) return toast.error(err);
      }
      if (row.state === "FIXED_SLOTS") {
        if (row.slots.length === 0)
          return toast.error(`${row.label}: add at least one drop-off time, or set the day to Closed.`);
        const err = validateSlots(row.slots, row.label);
        if (err) return toast.error(err);
      }
    }

    // Map each day's three-state UI onto what the server stores: a CLOSED day is
    // simply OPEN_HOURS with nothing switched on, so its remembered times survive.
    const payload = rows.map(({ dayOfWeek, state, windows, slots }) => ({
      dayOfWeek,
      mode: state === "FIXED_SLOTS" ? ("FIXED_SLOTS" as const) : ("OPEN_HOURS" as const),
      isActive: state === "OPEN_HOURS",
      windows,
      fixedSlots: [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }));

    startTransition(async () => {
      await runAction(() => saveWeeklyAvailability(payload), { success: "Availability updated" });
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.dayOfWeek} className="rounded-lg border border-border p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm font-medium">{row.label}</span>
              <div className="inline-flex rounded-full border border-border bg-muted/40 p-0.5">
                {(
                  [
                    { key: "OPEN_HOURS", label: "Open hours" },
                    { key: "FIXED_SLOTS", label: "Drop-off slots" },
                    { key: "CLOSED", label: "Closed" },
                  ] as const
                ).map((opt) => (
                  <Button
                    key={opt.key}
                    type="button"
                    variant={row.state === opt.key ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => updateRow(row.dayOfWeek, { state: opt.key })}
                    className="rounded-full"
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            {row.state === "CLOSED" && (
              <p className="mt-3 text-sm text-muted-foreground">Closed all day — customers can&apos;t book this day.</p>
            )}

            {row.state === "OPEN_HOURS" && (
              <div className="mt-3 flex flex-col gap-2">
                {row.windows.map((w, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={w.startTime}
                      onChange={(e) => updateWindow(row.dayOfWeek, i, { startTime: e.target.value })}
                      className="w-28 sm:w-32"
                    />
                    <span className="text-sm text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={w.endTime}
                      onChange={(e) => updateWindow(row.dayOfWeek, i, { endTime: e.target.value })}
                      className="w-28 sm:w-32"
                    />
                    {row.windows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove this time range"
                        onClick={() => removeWindow(row, i)}
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {row.windows.length < MAX_WINDOWS && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => addWindow(row)}
                    className="w-fit gap-1.5 px-2 text-muted-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add another range (for a break in the day)
                  </Button>
                )}
              </div>
            )}

            {row.state === "FIXED_SLOTS" && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Customers can only drop off at these exact times — one booking per slot. Each slot runs from its start
                  to its finish (an hour by default; change the finish time for a longer or shorter slot).
                </p>
                <SlotRows slots={row.slots} onChange={(slots) => updateRow(row.dayOfWeek, { slots })} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-1 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Open hours</span> — the day is open across the time ranges you
          set; add a second range for a lunch break.
        </p>
        <p>
          <span className="font-medium text-foreground">Drop-off slots</span> — only the exact times you list can be
          booked, one dog per slot. Perfect for set morning or evening drop-offs.
        </p>
        <p>
          <span className="font-medium text-foreground">Closed</span> — the day is shut and can&apos;t be booked at all.
        </p>
      </div>
      <Button onClick={handleSave} disabled={pending} className="mt-4">
        {pending ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
