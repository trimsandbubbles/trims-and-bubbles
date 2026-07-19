import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppointmentStatusBadge } from "@/components/status-badge";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";

export const metadata: Metadata = { title: "Appointments" };

export default async function PortalAppointmentsPage() {
  const session = await getCurrentSession();
  const client = await prisma.client.findUnique({ where: { userId: session!.user.id } });

  const [upcoming, past] = client
    ? await Promise.all([
        prisma.appointment.findMany({
          where: { clientId: client.id, startAt: { gte: new Date() }, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
          orderBy: { startAt: "asc" },
          include: { pet: true, primaryService: true },
        }),
        prisma.appointment.findMany({
          where: {
            clientId: client.id,
            OR: [{ startAt: { lt: new Date() } }, { status: { in: ["CANCELLED", "NO_SHOW"] } }],
          },
          orderBy: { startAt: "desc" },
          include: { pet: true, primaryService: true },
        }),
      ])
    : [[], []];

  const dateTimeFmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  // Count how many dogs share each bookingGroupId so grouped rows can show a hint.
  const bookingGroupCounts = new Map<string, number>();
  for (const apt of [...upcoming, ...past]) {
    if (!apt.bookingGroupId) continue;
    bookingGroupCounts.set(apt.bookingGroupId, (bookingGroupCounts.get(apt.bookingGroupId) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Appointments</h1>
          <p className="mt-1 text-muted-foreground">Your upcoming and past bookings.</p>
        </div>
        <Button render={<Link href="/book" />}>Book Now</Button>
      </div>

      <h2 className="mt-8 mb-3 text-lg font-semibold">Upcoming</h2>
      {upcoming.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <CalendarDays className="h-7 w-7" />
            <p>No upcoming appointments.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {upcoming.map((apt) => (
            <AppointmentRow
              key={apt.id}
              apt={apt}
              dateTimeFmt={dateTimeFmt}
              bookingGroupSize={apt.bookingGroupId ? bookingGroupCounts.get(apt.bookingGroupId) ?? 1 : 1}
            />
          ))}
        </div>
      )}

      <h2 className="mt-10 mb-3 text-lg font-semibold">Past</h2>
      {past.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">No past appointments yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {past.map((apt) => (
            <AppointmentRow
              key={apt.id}
              apt={apt}
              dateTimeFmt={dateTimeFmt}
              bookingGroupSize={apt.bookingGroupId ? bookingGroupCounts.get(apt.bookingGroupId) ?? 1 : 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AppointmentRow({
  apt,
  dateTimeFmt,
  bookingGroupSize,
}: {
  apt: {
    id: string;
    status: string;
    startAt: Date;
    totalPriceCents: number;
    pet: { name: string };
    primaryService: { name: string };
  };
  dateTimeFmt: Intl.DateTimeFormat;
  bookingGroupSize?: number;
}) {
  const otherDogsCount = (bookingGroupSize ?? 1) - 1;

  return (
    <Link href={`/portal/appointments/${apt.id}`} className="group block">
      <Card className="transition-colors group-hover:border-accent-solid/50">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
          <div>
            <p className="font-semibold">
              {apt.primaryService.name} for {apt.pet.name}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> {dateTimeFmt.format(apt.startAt)}
            </p>
            {otherDogsCount > 0 && (
              <p className="mt-1 text-xs font-medium text-accent-solid">
                +{otherDogsCount} more {otherDogsCount === 1 ? "dog" : "dogs"} in this booking
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="inline-flex items-center gap-1 text-sm font-bold text-accent-solid">
              View details <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{formatCents(apt.totalPriceCents)}</span>
              <AppointmentStatusBadge status={apt.status} />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
