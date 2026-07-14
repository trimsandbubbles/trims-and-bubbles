import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { CalendarDays, Dog, ImageIcon, MessageSquare, PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";

export const metadata: Metadata = { title: "My Account" };

export default async function PortalDashboardPage() {
  const session = await getCurrentSession();
  const client = await prisma.client.findUnique({ where: { userId: session!.user.id } });

  if (!client) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6">
        <h1 className="text-2xl font-semibold">Welcome!</h1>
        <p className="mt-2 text-muted-foreground">Let&apos;s get your first dog booked in.</p>
        <Button render={<Link href="/book" />} className="mt-6">
          Book an appointment
        </Button>
      </div>
    );
  }

  const [petCount, nextAppointment, latestPhoto, unreadMessages] = await Promise.all([
    prisma.pet.count({ where: { clientId: client.id, archivedAt: null } }),
    prisma.appointment.findFirst({
      where: { clientId: client.id, startAt: { gte: new Date() }, status: { in: ["CONFIRMED", "PENDING_PAYMENT", "IN_PROGRESS"] } },
      orderBy: { startAt: "asc" },
      include: { pet: true, primaryService: true },
    }),
    prisma.appointmentPhoto.findFirst({
      where: { appointment: { clientId: client.id } },
      orderBy: { createdAt: "desc" },
      include: { appointment: { include: { pet: true } } },
    }),
    prisma.clientMessage.count({ where: { clientId: client.id, readAt: null } }),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My Account</h1>
      <p className="mt-1 text-muted-foreground">A quick look at what&apos;s coming up.</p>

      {unreadMessages > 0 && (
        <Link href="/portal/messages" className="mt-6 block">
          <Card className="border-primary/40 bg-primary/5 transition-colors hover:border-primary/60">
            <CardContent className="flex items-center gap-3 py-4">
              <MessageSquare className="h-5 w-5 shrink-0 text-primary" />
              <p className="text-sm font-medium">
                You have {unreadMessages} unread message{unreadMessages === 1 ? "" : "s"} from Trims &amp; Bubbles
              </p>
            </CardContent>
          </Card>
        </Link>
      )}

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4.5 w-4.5 text-primary" /> Next appointment
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nextAppointment ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-medium">
                    {nextAppointment.primaryService.name} for {nextAppointment.pet.name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {new Intl.DateTimeFormat("en-AU", {
                      timeZone: "Australia/Sydney",
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(nextAppointment.startAt)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{formatCents(nextAppointment.totalPriceCents)}</p>
                </div>
                <Button variant="outline" render={<Link href={`/portal/appointments/${nextAppointment.id}`} />}>
                  View details
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">No upcoming appointments booked yet.</p>
                <Button render={<Link href="/book" />}>Book Now</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PawPrint className="h-4.5 w-4.5 text-primary" /> Your dogs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{petCount}</p>
            <Button variant="ghost" render={<Link href="/portal/pets" />} className="mt-2 px-0">
              <Dog className="h-4 w-4" /> Manage dogs
            </Button>
          </CardContent>
        </Card>
      </div>

      {latestPhoto && (
        <div className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <ImageIcon className="h-4.5 w-4.5 text-primary" /> Latest photo
          </h2>
          <Link
            href={`/portal/appointments/${latestPhoto.appointmentId}`}
            className="block max-w-xs overflow-hidden rounded-xl border border-border"
          >
            <div className="relative aspect-square">
              <Image
                src={latestPhoto.url}
                alt={latestPhoto.caption ?? `${latestPhoto.appointment.pet.name} after their groom`}
                fill
                priority
                className="object-cover"
                sizes="320px"
              />
            </div>
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {latestPhoto.caption ?? `${latestPhoto.appointment.pet.name}'s latest groom`}
            </p>
          </Link>
        </div>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        <Button render={<Link href="/book" />}>Book another appointment</Button>
        <Button variant="outline" render={<Link href="/portal/appointments" />}>
          View appointment history
        </Button>
      </div>
    </div>
  );
}
