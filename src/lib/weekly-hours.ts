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
