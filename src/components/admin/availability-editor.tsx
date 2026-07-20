"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { runAction } from "@/lib/run-action";
import { saveWeeklyAvailability } from "@/lib/actions/availability-admin";

type TimeWindow = { startTime: string; endTime: string };
type Mode = "OPEN_HOURS" | "FIXED_SLOTS";
type DayRow = {
  dayOfWeek: number;
  label: string;
  mode: Mode;
  /** Open/closed switch — only meaningful in "open hours" mode. */
  isActive: boolean;
  windows: TimeWindow[];
  fixedSlots: TimeWindow[];
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

/** Checks a list of ranges is internally ordered and non-overlapping,
 * mirroring the server's validation so the owner gets instant feedback. */
function findRangeError(ranges: TimeWindow[], dayLabel: string, noun: string): string | null {
  const sorted = [...ranges].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (const r of sorted) {
    if (r.endTime <= r.startTime) return `${dayLabel}: each ${noun}'s finish time must be after its start time.`;
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startTime < sorted[i - 1].endTime) {
      return `${dayLabel}: the ${noun}s overlap — adjust them so they don't.`;
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
  initialModes: { dayOfWeek: number; mode: Mode }[];
  initialFixedSlots: { dayOfWeek: number; startTime: string; endTime: string }[];
}) {
  const [rows, setRows] = useState<DayRow[]>(() =>
    DAY_ORDER.map(({ dayOfWeek, label }) => {
      const existingRules = initialRules
        .filter((r) => r.dayOfWeek === dayOfWeek)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      const existingSlots = initialFixedSlots
        .filter((s) => s.dayOfWeek === dayOfWeek)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      return {
        dayOfWeek,
        label,
        mode: initialModes.find((m) => m.dayOfWeek === dayOfWeek)?.mode ?? "OPEN_HOURS",
        isActive: existingRules.some((r) => r.isActive),
        windows: existingRules.length
          ? existingRules.map((r) => ({ startTime: r.startTime, endTime: r.endTime }))
          : [{ startTime: "09:00", endTime: "17:00" }],
        fixedSlots: existingSlots.map((s) => ({ startTime: s.startTime, endTime: s.endTime })),
      };
    }),
  );
  const [pending, startTransition] = useTransition();

  function updateRow(dayOfWeek: number, patch: Partial<DayRow>) {
    setRows((prev) => prev.map((r) => (r.dayOfWeek === dayOfWeek ? { ...r, ...patch } : r)));
  }

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
    // Suggest a sensible follow-on block: start an hour after the last finish.
    const last = day.windows[day.windows.length - 1];
    const [h] = last.endTime.split(":").map(Number);
    const startH = Math.min(h + 1, 22);
    const suggested = { startTime: `${pad(startH)}:00`, endTime: `${pad(Math.min(startH + 3, 23))}:00` };
    updateRow(day.dayOfWeek, { windows: [...day.windows, suggested] });
  }

  function removeWindow(day: DayRow, index: number) {
    if (day.windows.length <= 1) return;
    updateRow(day.dayOfWeek, { windows: day.windows.filter((_, i) => i !== index) });
  }

  function updateFixedSlot(dayOfWeek: number, index: number, patch: Partial<TimeWindow>) {
    setRows((prev) =>
      prev.map((r) =>
        r.dayOfWeek === dayOfWeek
          ? { ...r, fixedSlots: r.fixedSlots.map((s, i) => (i === index ? { ...s, ...patch } : s)) }
          : r,
      ),
    );
  }

  function addFixedSlot(day: DayRow) {
    if (day.fixedSlots.length >= MAX_FIXED_SLOTS) return;
    if (day.fixedSlots.length === 0) {
      updateRow(day.dayOfWeek, { fixedSlots: [{ startTime: "09:00", endTime: "10:00" }] });
      return;
    }
    // Suggest the next hour-long slot right after the last one finishes.
    const last = day.fixedSlots[day.fixedSlots.length - 1];
    const [h] = last.endTime.split(":").map(Number);
    const startH = Math.min(h, 23);
    const suggested = { startTime: `${pad(startH)}:00`, endTime: `${pad(Math.min(startH + 1, 23))}:00` };
    updateRow(day.dayOfWeek, { fixedSlots: [...day.fixedSlots, suggested] });
  }

  function removeFixedSlot(day: DayRow, index: number) {
    updateRow(day.dayOfWeek, { fixedSlots: day.fixedSlots.filter((_, i) => i !== index) });
  }

  function handleSave() {
    for (const row of rows) {
      if (row.mode === "OPEN_HOURS" && row.isActive) {
        const err = findRangeError(row.windows, row.label, "time range");
        if (err) {
          toast.error(err);
          return;
        }
      }
      if (row.mode === "FIXED_SLOTS" && row.fixedSlots.length > 0) {
        const err = findRangeError(row.fixedSlots, row.label, "slot");
        if (err) {
          toast.error(err);
          return;
        }
      }
    }
    startTransition(async () => {
      await runAction(
        () =>
          saveWeeklyAvailability(
            rows.map(({ dayOfWeek, mode, isActive, windows, fixedSlots }) => ({ dayOfWeek, mode, isActive, windows, fixedSlots })),
          ),
        { success: "Availability updated" },
      );
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
                <Button
                  type="button"
                  variant={row.mode === "OPEN_HOURS" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => updateRow(row.dayOfWeek, { mode: "OPEN_HOURS" })}
                  className="rounded-full"
                >
                  Open hours
                </Button>
                <Button
                  type="button"
                  variant={row.mode === "FIXED_SLOTS" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => updateRow(row.dayOfWeek, { mode: "FIXED_SLOTS" })}
                  className="rounded-full"
                >
                  Fixed slots
                </Button>
              </div>
            </div>

            {row.mode === "OPEN_HOURS" ? (
              <div className="mt-3 flex flex-wrap items-start gap-3 sm:gap-4">
                <div className="flex w-32 shrink-0 items-center gap-2.5 pt-1.5">
                  <Switch checked={row.isActive} onCheckedChange={(checked) => updateRow(row.dayOfWeek, { isActive: checked })} />
                  <span className="text-sm text-muted-foreground">{row.isActive ? "Open" : "Closed"}</span>
                </div>
                {row.isActive ? (
                  <div className="flex flex-col gap-2">
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
                        Add another time (for a break in the day)
                      </Button>
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Customers can only book these exact times — one booking per slot. Great for, say, a few Sunday appointments.
                </p>
                {row.fixedSlots.length === 0 ? (
                  <span className="block text-sm text-muted-foreground">No fixed slots yet — add one below.</span>
                ) : (
                  <div className="flex flex-col gap-2">
                    {row.fixedSlots.map((s, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={s.startTime}
                          onChange={(e) => updateFixedSlot(row.dayOfWeek, i, { startTime: e.target.value })}
                          className="w-32"
                        />
                        <span className="text-sm text-muted-foreground">to</span>
                        <Input
                          type="time"
                          value={s.endTime}
                          onChange={(e) => updateFixedSlot(row.dayOfWeek, i, { endTime: e.target.value })}
                          className="w-32"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove this slot"
                          onClick={() => removeFixedSlot(row, i)}
                          className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {row.fixedSlots.length < MAX_FIXED_SLOTS && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => addFixedSlot(row)}
                    className="w-fit gap-1.5 px-2 text-muted-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add a slot
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Open hours: need a lunch break or a gap during the day? Add a second time range — for example 9:00 to 12:00 and 3:00 to 8:00.
        Fixed slots: set the exact appointment times you're willing to take that day; nothing else is offered.
      </p>
      <Button onClick={handleSave} disabled={pending} className="mt-4">
        {pending ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
