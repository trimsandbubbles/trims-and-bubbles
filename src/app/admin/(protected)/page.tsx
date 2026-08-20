import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Clock, Dog, PawPrint, Phone, MessageSquare, StickyNote } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppointmentStatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { sydneyCalendarDayRange } from "@/lib/availability-data";
import { formatCents, SIZE_BAND_LABELS } from "@/lib/format";

export const metadata: Metadata = { title: "Today | Admin" };

export default async function AdminTodayPage() {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const { start, end } = sydneyCalendarDayRange(todayStr);

  const appointments = await prisma.appointment.findMany({
    where: { startAt: { gte: start, lt: end }, status: { notIn: ["CANCELLED"] } },
    orderBy: { startAt: "asc" },
    include: { pet: true, client: { include: { user: true } }, primaryService: true, addOns: { include: { service: true } } },
  });

  const timeFmt = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", hour: "numeric", minute: "2-digit" });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
      <p className="mt-1 text-muted-foreground">
        {new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", weekday: "long", day: "numeric", month: "long" }).format(
          new Date(),
        )}
        {" · "}
        {appointments.length} {appointments.length === 1 ? "appointment" : "appointments"}
      </p>

      {appointments.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <CalendarDays className="h-8 w-8" />
            <p>No appointments booked for today.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {appointments.map((apt) => (
            <Card key={apt.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{apt.primaryService.name}</CardTitle>
                  <AppointmentStatusBadge status={apt.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <Clock className="h-4 w-4 shrink-0 text-primary" />
                  {timeFmt.format(apt.startAt)} – {timeFmt.format(apt.endAt)}
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Dog className="h-4 w-4 shrink-0" /> {apt.pet.name} · {SIZE_BAND_LABELS[apt.sizeBandAtBooking]}
                  {apt.pet.breed ? ` · ${apt.pet.breed}` : ""}
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <PawPrint className="h-4 w-4 shrink-0" /> {apt.client.user.name}
                </p>
                {apt.addOns.length > 0 && (
                  <p className="text-xs text-muted-foreground">+ {apt.addOns.map((a) => a.service.name).join(", ")}</p>
                )}
                {apt.pickupRequested && (
                  <Badge variant="outline" className="text-xs">
                    Pickup &amp; drop-off
                  </Badge>
                )}
                {(apt.notesFromClient || apt.pet.temperamentNotes) && (
                  <div className="flex items-start gap-2 rounded-lg bg-muted/60 p-2 text-xs text-muted-foreground">
                    <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      {apt.pet.temperamentNotes && <span className="block">{apt.pet.temperamentNotes}</span>}
                      {apt.notesFromClient && <span className="block">&ldquo;{apt.notesFromClient}&rdquo;</span>}
                    </span>
                  </div>
                )}

                {/* Tap-to-call / text — the fastest way to reach the owner about today's dog. */}
                {apt.client.phone && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" render={<a href={`tel:${apt.client.phone}`} />}>
                      <Phone className="h-3.5 w-3.5" /> Call
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" render={<a href={`sms:${apt.client.phone}`} />}>
                      <MessageSquare className="h-3.5 w-3.5" /> Text
                    </Button>
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-border pt-2">
                  <span className="text-muted-foreground">{formatCents(apt.totalPriceCents)}</span>
                  <Link href={`/admin/appointments/${apt.id}`} className="font-medium text-primary underline underline-offset-4">
                    Open
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
