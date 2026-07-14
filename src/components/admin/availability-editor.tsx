"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateWeeklyHours } from "@/lib/actions/availability-admin";

type DayRow = { dayOfWeek: number; label: string; isActive: boolean; startTime: string; endTime: string };

const DAY_ORDER: { dayOfWeek: number; label: string }[] = [
  { dayOfWeek: 1, label: "Monday" },
  { dayOfWeek: 2, label: "Tuesday" },
  { dayOfWeek: 3, label: "Wednesday" },
  { dayOfWeek: 4, label: "Thursday" },
  { dayOfWeek: 5, label: "Friday" },
  { dayOfWeek: 6, label: "Saturday" },
  { dayOfWeek: 0, label: "Sunday" },
];

export function AvailabilityEditor({
  initialRules,
}: {
  initialRules: { dayOfWeek: number; isActive: boolean; startTime: string; endTime: string }[];
}) {
  const [rows, setRows] = useState<DayRow[]>(() =>
    DAY_ORDER.map(({ dayOfWeek, label }) => {
      const existing = initialRules.find((r) => r.dayOfWeek === dayOfWeek);
      return {
        dayOfWeek,
        label,
        isActive: existing?.isActive ?? false,
        startTime: existing?.startTime ?? "09:00",
        endTime: existing?.endTime ?? "17:00",
      };
    }),
  );
  const [pending, startTransition] = useTransition();

  function updateRow(dayOfWeek: number, patch: Partial<DayRow>) {
    setRows((prev) => prev.map((r) => (r.dayOfWeek === dayOfWeek ? { ...r, ...patch } : r)));
  }

  function handleSave() {
    startTransition(async () => {
      const result = await updateWeeklyHours(rows.map(({ dayOfWeek, isActive, startTime, endTime }) => ({ dayOfWeek, isActive, startTime, endTime })));
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
          <div key={row.dayOfWeek} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 sm:gap-4">
            <div className="flex w-32 shrink-0 items-center gap-2.5">
              <Switch checked={row.isActive} onCheckedChange={(checked) => updateRow(row.dayOfWeek, { isActive: checked })} />
              <span className="text-sm font-medium">{row.label}</span>
            </div>
            {row.isActive ? (
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={row.startTime}
                  onChange={(e) => updateRow(row.dayOfWeek, { startTime: e.target.value })}
                  className="w-32"
                />
                <span className="text-sm text-muted-foreground">to</span>
                <Input
                  type="time"
                  value={row.endTime}
                  onChange={(e) => updateRow(row.dayOfWeek, { endTime: e.target.value })}
                  className="w-32"
                />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Closed</span>
            )}
          </div>
        ))}
      </div>
      <Button onClick={handleSave} disabled={pending} className="mt-5">
        {pending ? "Saving..." : "Save hours"}
      </Button>
    </div>
  );
}
