/** Pure display helper: collapse AvailabilityRule rows (now possibly several
 * per day — one per open window) into one entry per weekday for rendering. */

export type WeeklyRuleRow = { dayOfWeek: number; isActive: boolean; startTime: string; endTime: string };

export type GroupedDay = {
  dayOfWeek: number;
  isActive: boolean;
  windows: { startTime: string; endTime: string }[];
};

export function groupWeeklyRules(rules: WeeklyRuleRow[]): GroupedDay[] {
  const byDay = new Map<number, GroupedDay>();
  for (const r of rules) {
    const day = byDay.get(r.dayOfWeek) ?? { dayOfWeek: r.dayOfWeek, isActive: false, windows: [] };
    // A day is "open" if ANY of its windows is active; inactive rows are
    // remembered times for a closed day and aren't displayed.
    if (r.isActive) {
      day.isActive = true;
      day.windows.push({ startTime: r.startTime, endTime: r.endTime });
    }
    byDay.set(r.dayOfWeek, day);
  }
  for (const day of byDay.values()) {
    day.windows.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  return [...byDay.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

/** Mirrors availability.ts's AvailabilityMode, kept local so this module stays
 * Prisma-free. A weekday with no entry in the modes map is OPEN_HOURS. */
export type AvailabilityDisplayMode = "OPEN_HOURS" | "FIXED_SLOTS";

export type TimeRange = { startTime: string; endTime: string };

/** One weekday's display info, mode-aware: `ranges` are open windows in
 * OPEN_HOURS mode, or the individual fixed slots in FIXED_SLOTS mode. */
export type WeeklyDisplayDay = {
  dayOfWeek: number;
  mode: AvailabilityDisplayMode;
  /** (OPEN_HOURS and >=1 active window) OR (FIXED_SLOTS and >=1 active fixed slot). */
  isOpen: boolean;
  ranges: TimeRange[];
};

/**
 * Mode-aware version of groupWeeklyRules: resolves each weekday's display
 * ranges from EITHER its AvailabilityRule windows (OPEN_HOURS) or its fixed
 * slots (FIXED_SLOTS). A day switched to FIXED_SLOTS has its AvailabilityRule
 * rows stored inactive — those rows carry no display meaning for such a day,
 * so its hours/openness come from `fixedSlots` instead.
 */
export function resolveWeeklyDisplay(
  rules: WeeklyRuleRow[],
  modes: Record<number, AvailabilityDisplayMode>,
  fixedSlots: Record<number, TimeRange[]>,
): WeeklyDisplayDay[] {
  const grouped = groupWeeklyRules(rules);
  const byDay = new Map(grouped.map((d) => [d.dayOfWeek, d]));
  const allDays = new Set<number>([
    ...byDay.keys(),
    ...Object.keys(modes).map(Number),
    ...Object.keys(fixedSlots).map(Number),
  ]);
  return [...allDays]
    .sort((a, b) => a - b)
    .map((dayOfWeek) => {
      const mode = modes[dayOfWeek] ?? "OPEN_HOURS";
      if (mode === "FIXED_SLOTS") {
        const ranges = fixedSlots[dayOfWeek] ?? [];
        return { dayOfWeek, mode, isOpen: ranges.length > 0, ranges };
      }
      const openDay = byDay.get(dayOfWeek);
      return { dayOfWeek, mode, isOpen: openDay?.isActive ?? false, ranges: openDay?.windows ?? [] };
    });
}

/** Formats a "HH:mm" wall-clock time in the friendly am/pm style used across
 * the customer-facing hours displays, e.g. "9am", "5:30pm". */
export function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hr}${ampm}` : `${hr}:${String(m).padStart(2, "0")}${ampm}`;
}

/** Joins a day's ranges into one friendly am/pm string, e.g.
 * "8am – 9am & 10am – 12pm". Used for FIXED_SLOTS days so customers see the
 * specific times rather than jargon. */
export function formatRangesFriendly(ranges: TimeRange[]): string {
  return ranges.map((r) => `${fmtTime(r.startTime)} – ${fmtTime(r.endTime)}`).join(" & ");
}
