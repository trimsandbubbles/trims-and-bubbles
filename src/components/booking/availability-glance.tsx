import { CalendarClock } from "lucide-react";
import {
  fmtTime,
  resolveWeeklyDisplay,
  type AvailabilityDisplayMode,
  type TimeRange,
  type WeeklyRuleRow,
} from "@/lib/weekly-hours";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Monday-first display order.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * A quick "here's when we're open" summary shown at the top of the booking
 * page, so people get an immediate feel for availability before working
 * through the wizard (they still pick an exact live time on the calendar in
 * the Date & time step).
 *
 * Mode-aware: a FIXED_SLOTS weekday shows its individual fixed slots instead
 * of AvailabilityRule windows (which are stored inactive for such a day).
 */
export function AvailabilityGlance({
  rules,
  modes = {},
  fixedSlots = {},
}: {
  rules: WeeklyRuleRow[];
  modes?: Record<number, AvailabilityDisplayMode>;
  fixedSlots?: Record<number, TimeRange[]>;
}) {
  const grouped = resolveWeeklyDisplay(rules, modes, fixedSlots);
  const days = ORDER.map((d) => grouped.find((r) => r.dayOfWeek === d)).filter((r): r is NonNullable<typeof r> => !!r);
  if (days.length === 0) return null;

  return (
    <div className="mx-auto max-w-2xl px-4 pt-8 sm:px-6">
      <div className="rounded-2xl border border-border bg-secondary/50 p-5">
        <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-accent-solid">
          <CalendarClock className="h-4 w-4" /> When we&apos;re open
        </p>
        <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
          {days.map((d) => (
            <div key={d.dayOfWeek} className="flex items-center justify-between gap-3 border-b border-border/60 py-0.5 last:border-0">
              <span className="font-semibold">{DAY_LABELS[d.dayOfWeek]}</span>
              <span className={d.isOpen ? "text-muted-foreground" : "text-muted-foreground/70"}>
                {d.isOpen
                  ? d.ranges.map((w) => `${fmtTime(w.startTime)} – ${fmtTime(w.endTime)}`).join(" & ")
                  : "Closed"}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Pick your exact time on the calendar in the last step — live openings update as you go.
        </p>
      </div>
    </div>
  );
}
