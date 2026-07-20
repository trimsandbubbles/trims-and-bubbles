import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { AdminCalendar, type CalendarEventDTO } from "@/components/admin/admin-calendar";

export const metadata: Metadata = { title: "Calendar | Admin" };

// --- Deriving the visible time grid from the actual configured hours -------
// The calendar's slotMinTime/slotMaxTime should cover the real working day,
// not a guess. We pad an hour before the earliest open and half an hour
// after the latest close (rounded to the half hour) so no appointment ever
// falls outside the visible grid. Falls back to a sensible default if no
// hours are configured yet (e.g. a brand-new install).
const DEFAULT_SLOT_MIN_TIME = "08:00:00";
const DEFAULT_SLOT_MAX_TIME = "20:30:00";

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, minutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

export default async function AdminCalendarPage() {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 14 * 24 * 60 * 60_000);
  const windowEnd = new Date(now.getTime() + 60 * 24 * 60 * 60_000);

  const [appointments, blocks, activeHours] = await Promise.all([
    prisma.appointment.findMany({
      where: { startAt: { gte: windowStart, lt: windowEnd }, status: { notIn: ["CANCELLED"] } },
      include: { pet: true, primaryService: true },
      orderBy: { startAt: "asc" },
    }),
    prisma.blockedTimeSlot.findMany({
      where: { startAt: { gte: windowStart, lt: windowEnd } },
      orderBy: { startAt: "asc" },
    }),
    prisma.availabilityRule.findMany({
      where: { isActive: true },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
  ]);

  // FullCalendar's `businessHours` shades non-working hours AND fully closed
  // days (a weekday with no entry at all renders as one long shaded block),
  // so this doubles as the "closed days look closed" fix.
  const businessHours = activeHours.map((rule) => ({
    daysOfWeek: [rule.dayOfWeek],
    startTime: rule.startTime,
    endTime: rule.endTime,
  }));

  let slotMinTime = DEFAULT_SLOT_MIN_TIME;
  let slotMaxTime = DEFAULT_SLOT_MAX_TIME;
  if (activeHours.length > 0) {
    const earliestStart = Math.min(...activeHours.map((r) => timeToMinutes(r.startTime)));
    const latestEnd = Math.max(...activeHours.map((r) => timeToMinutes(r.endTime)));
    slotMinTime = minutesToTime(Math.floor((earliestStart - 60) / 30) * 30);
    slotMaxTime = minutesToTime(Math.ceil((latestEnd + 30) / 30) * 30);
  }

  const events: CalendarEventDTO[] = [
    ...appointments.map((apt) => ({
      id: apt.id,
      title: `${apt.pet.name} — ${apt.primaryService.name}`,
      start: apt.startAt.toISOString(),
      end: apt.endAt.toISOString(),
      status: apt.status,
      kind: "appointment" as const,
    })),
    ...blocks.map((b) => ({
      id: b.id,
      title: `Blocked${b.reason ? `: ${b.reason}` : ""}`,
      start: b.startAt.toISOString(),
      end: b.endAt.toISOString(),
      status: "BLOCKED",
      kind: "blocked" as const,
    })),
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
      <p className="mt-1 text-muted-foreground">Every upcoming appointment and blocked-off time in one view.</p>
      <div className="mt-6">
        <AdminCalendar
          events={events}
          businessHours={businessHours}
          slotMinTime={slotMinTime}
          slotMaxTime={slotMaxTime}
        />
      </div>
    </div>
  );
}
