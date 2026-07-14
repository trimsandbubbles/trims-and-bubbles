import { CalendarClock } from "lucide-react";
import { groupWeeklyRules } from "@/lib/weekly-hours";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Monday-first display order.
const ORDER = [1, 2, 3, 4, 5, 6, 0];

function fmtTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hr}${ampm}` : `${hr}:${String(m).padStart(2, "0")}${ampm}`;
}

/**
 * A quick "here's when we're open" summary shown at the top of the booking
 * page, so people get an immediate feel for availability before working
 * through the wizard (they still pick an exact live time on the calendar in
 * the Date & time step).
 */
export function AvailabilityGlance({
  rules,
}: {
  rules: { dayOfWeek: number; isActive: boolean; startTime: string; endTime: string }[];
}) {
  const grouped = groupWeeklyRules(rules);
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
              <span className={d.isActive ? "text-muted-foreground" : "text-muted-foreground/70"}>
                {d.isActive
                  ? d.windows.map((w) => `${fmtTime(w.startTime)} – ${fmtTime(w.endTime)}`).join(" & ")
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
