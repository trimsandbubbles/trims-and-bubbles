"use client";

import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type TimeWindow = { startTime: string; endTime: string };

/** Default length for a freshly-added drop-off slot. Owners can change any
 * slot's finish time afterwards, so slots aren't locked to one hour. */
export const DEFAULT_SLOT_LENGTH_MIN = 60;
const MAX_SLOTS = 24;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "17:00" + minutes -> "18:00", clamped so it never rolls past end of day. */
export function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + (m || 0) + mins);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Drop-off slots must each finish after they start and not overlap one another.
 * Returns a friendly message or null. `subject` names the day/date for the message. */
export function validateSlots(slots: TimeWindow[], subject: string): string | null {
  const sorted = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (const s of sorted) {
    if (s.endTime <= s.startTime) return `${subject}: each drop-off slot's finish time must be after its start time.`;
  }
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startTime < sorted[i - 1].endTime) {
      return `${subject}: the drop-off slots overlap — adjust them so they don't.`;
    }
  }
  return null;
}

/** An editable list of fixed drop-off slots (each a start + finish time). Used
 * both for the recurring weekly schedule and for one-off custom dates. */
export function SlotRows({
  slots,
  onChange,
  max = MAX_SLOTS,
}: {
  slots: TimeWindow[];
  onChange: (next: TimeWindow[]) => void;
  max?: number;
}) {
  function update(index: number, patch: Partial<TimeWindow>) {
    onChange(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function add() {
    if (slots.length >= max) return;
    if (slots.length === 0) {
      onChange([{ startTime: "09:00", endTime: "10:00" }]);
      return;
    }
    const latest = [...slots].sort((a, b) => a.startTime.localeCompare(b.startTime))[slots.length - 1];
    onChange([...slots, { startTime: latest.endTime, endTime: addMinutes(latest.endTime, DEFAULT_SLOT_LENGTH_MIN) }]);
  }
  function remove(index: number) {
    onChange(slots.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      {slots.length === 0 ? (
        <span className="block text-sm text-muted-foreground">No drop-off times yet — add one below.</span>
      ) : (
        <div className="flex flex-col gap-2">
          {slots.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                type="time"
                value={s.startTime}
                onChange={(e) => update(i, { startTime: e.target.value })}
                className="w-28 sm:w-32"
                aria-label="Drop-off time"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="time"
                value={s.endTime}
                onChange={(e) => update(i, { endTime: e.target.value })}
                className="w-28 sm:w-32"
                aria-label="Slot finishes by"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove this drop-off slot"
                onClick={() => remove(i)}
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      {slots.length < max && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={add}
          className="w-fit gap-1.5 px-2 text-muted-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Add a drop-off time
        </Button>
      )}
    </div>
  );
}
