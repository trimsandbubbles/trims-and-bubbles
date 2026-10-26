"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { runAction } from "@/lib/run-action";
import { createBlockedTimeSlot, deleteBlockedTimeSlot } from "@/lib/actions/admin-calendar";
import type { BlockGridDay, BlockGridSlot } from "@/lib/availability-data";

const TIME_FMT = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" });
const DAY_FMT = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long" });

/**
 * Owner grid to make individual slots unavailable (or open them back up),
 * without creating a fake booking. Each toggle just adds/removes a
 * BlockedTimeSlot — the booking calendar already treats those as busy, so a
 * blocked slot instantly stops being offered to customers. Real bookings show
 * as locked and can't be blocked here.
 */
export function BlockTimesGrid({ days }: { days: BlockGridDay[] }) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function toggle(slot: BlockGridSlot) {
    if (slot.status === "booked" || busyKey) return;
    setBusyKey(slot.startAt);
    if (slot.status === "open") {
      await runAction(() => createBlockedTimeSlot(slot.startAt, slot.endAt), {
        success: "Slot blocked off",
        onSuccess: () => router.refresh(),
      });
    } else if (slot.blockId) {
      await runAction(() => deleteBlockedTimeSlot(slot.blockId!), {
        success: "Slot opened back up",
        onSuccess: () => router.refresh(),
      });
    }
    setBusyKey(null);
  }

  const daysWithSlots = days.filter((d) => d.slots.length > 0);
  if (daysWithSlots.length === 0) {
    return <p className="mt-6 text-sm text-muted-foreground">No open days in the next two months to block.</p>;
  }

  return (
    <div className="mt-6 space-y-5">
      {daysWithSlots.map((day) => (
        <div key={day.dateStr} className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h2 className="text-sm font-semibold">{DAY_FMT.format(new Date(`${day.dateStr}T12:00:00`))}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {day.slots.map((slot) => {
              const label = TIME_FMT.format(new Date(slot.startAt));
              const isBusy = busyKey === slot.startAt;

              if (slot.status === "booked") {
                return (
                  <span
                    key={slot.startAt}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/50 px-2.5 py-1.5 text-sm tabular-nums text-muted-foreground/70"
                    title="Booked — can't be blocked"
                  >
                    <Lock className="h-3.5 w-3.5" /> {label}
                  </span>
                );
              }

              const blocked = slot.status === "blocked";
              return (
                <button
                  key={slot.startAt}
                  type="button"
                  disabled={isBusy}
                  onClick={() => toggle(slot)}
                  title={blocked ? "Blocked — click to open back up" : "Open — click to block off"}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm tabular-nums transition-colors disabled:opacity-60",
                    blocked
                      ? "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : blocked ? <Ban className="h-3.5 w-3.5" /> : null}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
