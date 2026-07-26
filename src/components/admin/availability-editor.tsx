"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { runAction } from "@/lib/run-action";
import { saveWeeklyAvailability } from "@/lib/actions/availability-admin";

type TimeWindow = { startTime: string; endTime: string };

/** Every drop-off/fixed slot is one hour long — that's the standard grooming
 * slot, and keeping every slot the same length is what lets adjacent slots
 * (8:00, 9:00, 10:00 …) each stay independently bookable without ever
 * overlapping. Change here if the standard slot length ever changes. */
const SLOT_LENGTH_MIN = 60;

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
  /** Fixed slots are stored as just their start time here; the finish time is
   * always start + one hour, filled in on save. */
  slotStarts: string[];
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
const MAX_FIXED_SLOTS = 24;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "17:00" + 60 -> "18:00". Clamped so it never rolls past end of day. */
function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + (m || 0) + mins);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** A friendly 12-hour label for a time, e.g. "8:00am", "5:00pm". */
function friendlyTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m || 0)}${period}`;
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

/** Fixed drop-off times must be at least one hour apart (each slot is an hour),
 * or two bookings could land on top of each other. */
function findSlotError(slotStarts: string[], dayLabel: string): string | null {
  const sorted = [...slotStarts].sort((a, b) => a.localeCompare(b));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]) return `${dayLabel}: you've listed the same drop-off time twice.`;
    if (addMinutes(sorted[i - 1], SLOT_LENGTH_MIN) > sorted[i]) {
      return `${dayLabel}: drop-off times need to be at least an hour apart.`;
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
        slotStarts: daySlots.map((s) => s.startTime),
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

  // ── Fixed drop-off slots (start times only) ───────────────────────────────
  function updateSlot(dayOfWeek: number, index: number, value: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.dayOfWeek === dayOfWeek ? { ...r, slotStarts: r.slotStarts.map((s, i) => (i === index ? value : s)) } : r,
      ),
    );
  }
  function addSlot(day: DayRow) {
    if (day.slotStarts.length >= MAX_FIXED_SLOTS) return;
    if (day.slotStarts.length === 0) {
      updateRow(day.dayOfWeek, { slotStarts: ["09:00"] });
      return;
    }
    // Suggest the next hour after the latest slot.
    const latest = [...day.slotStarts].sort((a, b) => a.localeCompare(b))[day.slotStarts.length - 1];
    updateRow(day.dayOfWeek, { slotStarts: [...day.slotStarts, addMinutes(latest, SLOT_LENGTH_MIN)] });
  }
  function removeSlot(day: DayRow, index: number) {
    updateRow(day.dayOfWeek, { slotStarts: day.slotStarts.filter((_, i) => i !== index) });
  }

  function handleSave() {
    for (const row of rows) {
      if (row.state === "OPEN_HOURS") {
        const err = findWindowError(row.windows, row.label);
        if (err) return toast.error(err);
      }
      if (row.state === "FIXED_SLOTS") {
        if (row.slotStarts.length === 0) return toast.error(`${row.label}: add at least one drop-off time, or set the day to Closed.`);
        const err = findSlotError(row.slotStarts, row.label);
        if (err) return toast.error(err);
      }
    }

    // Map each day's three-state UI onto what the server stores: a CLOSED day is
    // simply OPEN_HOURS with nothing switched on, so its remembered times survive.
    const payload = rows.map(({ dayOfWeek, state, windows, slotStarts }) => ({
      dayOfWeek,
      mode: state === "FIXED_SLOTS" ? ("FIXED_SLOTS" as const) : ("OPEN_HOURS" as const),
      isActive: state === "OPEN_HOURS",
      windows,
      fixedSlots: slotStarts
        .slice()
        .sort((a, b) => a.localeCompare(b))
        .map((startTime) => ({ startTime, endTime: addMinutes(startTime, SLOT_LENGTH_MIN) })),
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
                      className="w-32"
                    />
                    <span className="text-sm text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={w.endTime}
                      onChange={(e) => updateWindow(row.dayOfWeek, i, { endTime: e.target.value })}
                      className="w-32"
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
                  Customers can only drop off at these exact times — one booking per slot. Each slot runs one hour.
                </p>
                {row.slotStarts.length === 0 ? (
                  <span className="block text-sm text-muted-foreground">No drop-off times yet — add one below.</span>
                ) : (
                  <div className="flex flex-col gap-2">
                    {row.slotStarts.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={s}
                          onChange={(e) => updateSlot(row.dayOfWeek, i, e.target.value)}
                          className="w-32"
                        />
                        <span className="text-sm text-muted-foreground">drop-off ({friendlyTime(s)})</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove this drop-off time"
                          onClick={() => removeSlot(row, i)}
                          className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {row.slotStarts.length < MAX_FIXED_SLOTS && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => addSlot(row)}
                    className="w-fit gap-1.5 px-2 text-muted-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add a drop-off time
                  </Button>
                )}
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
