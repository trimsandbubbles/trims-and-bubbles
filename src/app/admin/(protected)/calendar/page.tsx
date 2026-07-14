import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { AdminCalendar, type CalendarEventDTO } from "@/components/admin/admin-calendar";

export const metadata: Metadata = { title: "Calendar | Admin" };

export default async function AdminCalendarPage() {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 14 * 24 * 60 * 60_000);
  const windowEnd = new Date(now.getTime() + 60 * 24 * 60 * 60_000);

  const [appointments, blocks] = await Promise.all([
    prisma.appointment.findMany({
      where: { startAt: { gte: windowStart, lt: windowEnd }, status: { notIn: ["CANCELLED"] } },
      include: { pet: true, primaryService: true },
      orderBy: { startAt: "asc" },
    }),
    prisma.blockedTimeSlot.findMany({
      where: { startAt: { gte: windowStart, lt: windowEnd } },
      orderBy: { startAt: "asc" },
    }),
  ]);

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
        <AdminCalendar events={events} />
      </div>
    </div>
  );
}
