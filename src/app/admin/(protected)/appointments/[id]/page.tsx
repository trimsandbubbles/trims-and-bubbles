import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, CreditCard, Dog, ImageIcon, Mail, Phone, StickyNote, Truck, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppointmentStatusBadge } from "@/components/status-badge";
import { CompleteAppointmentForm } from "@/components/admin/complete-appointment-form";
import { AppointmentStatusActions } from "@/components/admin/appointment-status-actions";
import { RescheduleDialog } from "@/components/admin/reschedule-dialog";
import { RecordPaymentForm } from "@/components/admin/record-payment-form";
import { PaymentRowActions } from "@/components/admin/payment-actions";
import { BookingGroupPanel } from "@/components/appointments/booking-group-panel";
import { prisma } from "@/lib/prisma";
import { requireStaffOrOwner } from "@/lib/session";
import { formatCents } from "@/lib/format";
import { computeBalanceOwingCents } from "@/lib/payments-data";

export const metadata: Metadata = { title: "Appointment | Admin" };

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
};

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "Deposit",
  BALANCE: "Balance",
  FULL: "Full payment",
  REFUND: "Refund",
};

export default async function AdminAppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireStaffOrOwner();
  const isOwner = session.user.role === "owner";

  const apt = await prisma.appointment.findUnique({
    where: { id },
    include: {
      pet: true,
      client: { include: { user: true } },
      primaryService: true,
      addOns: { include: { service: true } },
      photos: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!apt) notFound();

  const bookingGroupSiblings = apt.bookingGroupId
    ? await prisma.appointment.findMany({
        where: { bookingGroupId: apt.bookingGroupId, clientId: apt.clientId },
        include: { pet: true, primaryService: true },
        orderBy: { startAt: "asc" },
      })
    : [];
  const bookingGroupSize = bookingGroupSiblings.length;
  const otherBookingDogs = bookingGroupSiblings.filter((s) => s.id !== apt.id);

  const paidCents = apt.payments.filter((p) => p.status === "PAID" && p.type !== "REFUND").reduce((sum, p) => sum + p.amountCents, 0);
  const balanceOwingCents = computeBalanceOwingCents(apt.totalPriceCents, apt.payments);

  const dateTimeFmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/calendar" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Calendar
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{apt.primaryService.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" /> {dateTimeFmt.format(apt.startAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <AppointmentStatusBadge status={apt.status} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {apt.status !== "COMPLETED" && apt.status !== "CANCELLED" && apt.status !== "NO_SHOW" && (
              <RescheduleDialog
                appointmentId={apt.id}
                serviceId={apt.primaryServiceId}
                addOnIds={apt.addOns.map((a) => a.serviceId)}
              />
            )}
            <AppointmentStatusActions appointmentId={apt.id} status={apt.status} />
          </div>
        </div>
      </div>

      {bookingGroupSize > 1 && (
        <BookingGroupPanel
          title={`Part of a ${bookingGroupSize}-dog booking`}
          siblings={otherBookingDogs.map((s) => ({
            id: s.id,
            petName: s.pet.name,
            serviceName: s.primaryService.name,
            startAt: s.startAt,
            status: s.status,
          }))}
          basePath="/admin/appointments"
          dateTimeFmt={dateTimeFmt}
        />
      )}

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Card>
          <CardContent className="py-4 text-sm">
            <p className="mb-2 flex items-center gap-2 font-medium">
              <Dog className="h-4 w-4 text-primary" /> Dog
            </p>
            <Link href={`/admin/pets/${apt.pet.id}`} className="text-primary underline underline-offset-4">
              {apt.pet.name}
            </Link>
            <span className="text-muted-foreground"> ({apt.pet.breed ?? "mixed breed"})</span>
            {apt.addOns.length > 0 && (
              <p className="mt-3 text-muted-foreground">Add-ons: {apt.addOns.map((a) => a.service.name).join(", ")}</p>
            )}
            {apt.pickupRequested && (
              <p className="mt-3 flex items-center gap-2 text-muted-foreground">
                <Truck className="h-4 w-4 shrink-0" /> Pickup &amp; drop-off — {apt.pickupAddress ?? "address on file"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-4 text-sm">
            <p className="mb-2 flex items-center gap-2 font-medium">
              <User className="h-4 w-4 text-primary" /> Client
            </p>
            <Link href={`/admin/clients/${apt.client.id}`} className="text-primary underline underline-offset-4">
              {apt.client.user.name}
            </Link>
            {apt.client.phone && (
              <a href={`tel:${apt.client.phone}`} className="mt-2 flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" /> {apt.client.phone}
              </a>
            )}
            <a href={`mailto:${apt.client.user.email}`} className="mt-1 flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" /> {apt.client.user.email}
            </a>
          </CardContent>
        </Card>
      </div>

      {(apt.notesFromClient || apt.groomerNote) && (
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {apt.notesFromClient && (
            <Card>
              <CardContent className="py-4 text-sm">
                <p className="mb-2 flex items-center gap-2 font-medium">
                  <StickyNote className="h-4 w-4 text-primary" /> Client&apos;s notes
                </p>
                <p className="text-muted-foreground">{apt.notesFromClient}</p>
              </CardContent>
            </Card>
          )}
          {apt.groomerNote && (
            <Card>
              <CardContent className="py-4 text-sm">
                <p className="mb-2 flex items-center gap-2 font-medium">
                  <StickyNote className="h-4 w-4 text-primary" /> Groomer&apos;s note
                </p>
                <p className="text-muted-foreground italic">&ldquo;{apt.groomerNote}&rdquo;</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {apt.photos.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <ImageIcon className="h-4.5 w-4.5 text-primary" /> Photos
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {apt.photos.map((photo) => (
              <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl border border-border">
                <div className="relative aspect-square">
                  <Image src={photo.url} alt={photo.caption ?? `${apt.pet.name}'s groom`} fill className="object-cover" sizes="200px" />
                </div>
                {photo.caption && <p className="px-2 py-1.5 text-xs text-muted-foreground">{photo.caption}</p>}
              </a>
            ))}
          </div>
        </div>
      )}

      {apt.status !== "CANCELLED" && apt.status !== "NO_SHOW" && (
        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">{apt.status === "COMPLETED" ? "Add another photo or note" : "Complete this job"}</h2>
          <CompleteAppointmentForm appointmentId={apt.id} alreadyComplete={apt.status === "COMPLETED"} />
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <CreditCard className="h-4.5 w-4.5 text-primary" /> Payment
        </h2>
        <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <dl className="space-y-1 text-muted-foreground">
            <div className="flex justify-between">
              <dt>Total</dt>
              <dd>{formatCents(apt.totalPriceCents)}</dd>
            </div>
            {apt.depositPriceCents != null && (
              <div className="flex justify-between">
                <dt>Deposit required</dt>
                <dd>{formatCents(apt.depositPriceCents)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>Paid to date</dt>
              <dd>{formatCents(paidCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 font-medium text-foreground">
              <dt>Balance owing</dt>
              <dd>{formatCents(balanceOwingCents)}</dd>
            </div>
          </dl>
        </div>

        {apt.payments.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm">
            {apt.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <span>
                  {PAYMENT_TYPE_LABEL[p.type] ?? p.type}
                  <span className="text-muted-foreground"> · {p.method === "CASH" ? "Cash" : p.method === "OTHER" ? "Other" : "Card"}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground">{formatCents(p.amountCents)}</span>
                  <Badge variant={p.status === "PAID" ? "secondary" : p.status === "FAILED" ? "destructive" : "outline"}>
                    {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                  </Badge>
                  <PaymentRowActions paymentId={p.id} status={p.status} amountCents={p.amountCents} isOwner={isOwner} />
                </span>
              </li>
            ))}
          </ul>
        )}

        {balanceOwingCents > 0 && apt.status !== "CANCELLED" && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium">Record a payment collected in person</p>
            <RecordPaymentForm
              appointmentId={apt.id}
              status={apt.status}
              depositPriceCents={apt.depositPriceCents}
              balanceOwingCents={balanceOwingCents}
            />
          </div>
        )}
      </div>
    </div>
  );
}
