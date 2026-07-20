import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Clock, ArrowRight, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { AppointmentStatusBadge } from "@/components/status-badge";
import { CancelBookingButton } from "@/components/portal/cancel-booking-button";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { getBusinessDetails } from "@/lib/business-data";

export const metadata: Metadata = { title: "Appointments" };

export default async function PortalAppointmentsPage() {
  const session = await getCurrentSession();
  const client = await prisma.client.findUnique({ where: { userId: session!.user.id } });

  // Kick this off alongside the appointment queries below — it doesn't depend on them.
  const businessPromise = getBusinessDetails();

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

  const business = await businessPromise;

  const dateTimeFmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  // Count how many dogs share each bookingGroupId so grouped rows can show a hint.
  // This is a single pass over the appointments we already fetched — no per-row queries.
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
              isUpcoming
              contactPhone={business.contactPhone}
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
              isUpcoming={false}
              contactPhone={business.contactPhone}
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
  isUpcoming,
  contactPhone,
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
  isUpcoming: boolean;
  contactPhone: string;
}) {
  const otherDogsCount = (bookingGroupSize ?? 1) - 1;
  const cancellable =
    isUpcoming &&
    (apt.status === "CONFIRMED" || apt.status === "PENDING_PAYMENT") &&
    apt.startAt.getTime() > Date.now();
  const telHref = `tel:${contactPhone.replace(/[^\d+]/g, "")}`;

  return (
    // The card itself is not a link — the title area and "View details" are
    // separate links so real action buttons (Cancel booking, Book again) can
    // live in the footer without nesting interactive elements.
    <Card>
      <CardContent className="py-4 text-sm">
        <Link href={`/portal/appointments/${apt.id}`} className="group/title flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold group-hover/title:text-accent-solid">
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
            <span className="text-muted-foreground">{formatCents(apt.totalPriceCents)}</span>
            <AppointmentStatusBadge status={apt.status} />
          </div>
        </Link>
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/portal/appointments/${apt.id}`}
          className="inline-flex items-center gap-1 text-sm font-bold text-accent-solid hover:underline"
        >
          View details <ArrowRight className="h-3.5 w-3.5" />
        </Link>

        {isUpcoming ? (
          cancellable ? (
            <CancelBookingButton
              appointmentId={apt.id}
              dogCount={bookingGroupSize ?? 1}
              petName={apt.pet.name}
              serviceName={apt.primaryService.name}
              startAt={apt.startAt}
              size="touch"
            />
          ) : (
            <div className="flex flex-col items-end gap-1 text-right">
              <Button variant="destructive" size="touch" disabled>
                <XCircle className="h-4 w-4" /> Cancel booking
              </Button>
              <p className="text-xs text-muted-foreground">
                Already started — call{" "}
                <a href={telHref} className="font-medium text-foreground underline underline-offset-4">
                  {contactPhone}
                </a>
              </p>
            </div>
          )
        ) : (
          <Button variant="outline" size="touch" render={<Link href="/book" />}>
            Book again
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
