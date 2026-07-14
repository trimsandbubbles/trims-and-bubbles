"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateWeeklyHours } from "@/lib/actions/availability-admin";

type TimeWindow = { startTime: string; endTime: string };
type DayRow = { dayOfWeek: number; label: string; isActive: boolean; windows: TimeWindow[] };

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

export function AvailabilityEditor({
  initialRules,
}: {
  initialRules: { dayOfWeek: number; isActive: boolean; startTime: string; endTime: string }[];
}) {
  const [rows, setRows] = useState<DayRow[]>(() =>
    DAY_ORDER.map(({ dayOfWeek, label }) => {
      const existing = initialRules
        .filter((r) => r.dayOfWeek === dayOfWeek)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      return {
        dayOfWeek,
        label,
        isActive: existing.some((r) => r.isActive),
        windows: existing.length
          ? existing.map((r) => ({ startTime: r.startTime, endTime: r.endTime }))
          : [{ startTime: "09:00", endTime: "17:00" }],
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
    const suggested = {
      startTime: `${String(startH).padStart(2, "0")}:00`,
      endTime: `${String(Math.min(startH + 3, 23)).padStart(2, "0")}:00`,
    };
    updateRow(day.dayOfWeek, { windows: [...day.windows, suggested] });
  }

  function removeWindow(day: DayRow, index: number) {
    if (day.windows.length <= 1) return;
    updateRow(day.dayOfWeek, { windows: day.windows.filter((_, i) => i !== index) });
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateWeeklyHours(
        rows.map(({ dayOfWeek, isActive, windows }) => ({ dayOfWeek, isActive, windows })),
      );
      if (result.status === "success") {
        toast.success("Opening hours updated");
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.dayOfWeek} className="flex flex-wrap items-start gap-3 rounded-lg border border-border p-3 sm:gap-4">
            <div className="flex w-32 shrink-0 items-center gap-2.5 pt-1.5">
              <Switch checked={row.isActive} onCheckedChange={(checked) => updateRow(row.dayOfWeek, { isActive: checked })} />
              <span className="text-sm font-medium">{row.label}</span>
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
            ) : (
              <span className="pt-1.5 text-sm text-muted-foreground">Closed</span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Need a lunch break or a gap during the day? Add a second time range — for example 9:00 to 12:00 and 3:00 to 8:00.
        Clients can only book inside these times.
      </p>
      <Button onClick={handleSave} disabled={pending} className="mt-4">
        {pending ? "Saving..." : "Save hours"}
      </Button>
    </div>
  );
}
