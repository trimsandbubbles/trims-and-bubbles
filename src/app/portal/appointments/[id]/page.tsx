import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, CreditCard, Dog, ImageIcon, StickyNote, Truck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AppointmentStatusBadge } from "@/components/status-badge";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";
import { computeBalanceOwingCents } from "@/lib/payments-data";
import { isStripeConfigured } from "@/lib/stripe";
import { PayBalanceButton } from "@/components/portal/pay-balance-button";

export const metadata: Metadata = { title: "Appointment Details" };

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

export default async function PortalAppointmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { id } = await params;
  const { paid } = await searchParams;
  const session = await getCurrentSession();
  const client = await prisma.client.findUnique({ where: { userId: session!.user.id } });
  if (!client) notFound();

  const apt = await prisma.appointment.findFirst({
    where: { id, clientId: client.id },
    include: {
      pet: true,
      primaryService: true,
      addOns: { include: { service: true } },
      photos: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!apt) notFound();

  const paidCents = apt.payments.filter((p) => p.status === "PAID" && p.type !== "REFUND").reduce((sum, p) => sum + p.amountCents, 0);
  const balanceOwingCents = computeBalanceOwingCents(apt.totalPriceCents, apt.payments);
  const isCancelled = apt.status === "CANCELLED" || apt.status === "NO_SHOW";

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
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Link href="/portal/appointments" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Appointments
      </Link>

      {paid === "1" && (
        <Alert className="mt-4">
          <CheckCircle2 />
          <AlertDescription>
            Thanks for your payment! If this page still shows a balance for a minute, refresh — we&apos;re confirming it now.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{apt.primaryService.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" /> {dateTimeFmt.format(apt.startAt)}
          </p>
        </div>
        <AppointmentStatusBadge status={apt.status} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Card>
          <CardContent className="py-4 text-sm">
            <p className="mb-2 flex items-center gap-2 font-medium">
              <Dog className="h-4 w-4 text-primary" /> Dog
            </p>
            <Link href={`/portal/pets/${apt.pet.id}`} className="text-primary underline underline-offset-4">
              {apt.pet.name}
            </Link>
            <span className="text-muted-foreground"> ({apt.pet.breed ?? "mixed breed"})</span>
            {apt.addOns.length > 0 && (
              <p className="mt-3 text-muted-foreground">Add-ons: {apt.addOns.map((a) => a.service.name).join(", ")}</p>
            )}
          </CardContent>
        </Card>

        {apt.pickupRequested && (
          <Card>
            <CardContent className="py-4 text-sm">
              <p className="mb-2 flex items-center gap-2 font-medium">
                <Truck className="h-4 w-4 text-primary" /> Pickup &amp; drop-off
              </p>
              <p className="text-muted-foreground">{apt.pickupAddress ?? "Address on file"}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {(apt.notesFromClient || apt.groomerNote) && (
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {apt.notesFromClient && (
            <Card>
              <CardContent className="py-4 text-sm">
                <p className="mb-2 flex items-center gap-2 font-medium">
                  <StickyNote className="h-4 w-4 text-primary" /> Your notes
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

          {balanceOwingCents > 0 && !isCancelled && (
            <div className="mt-3">
              {isStripeConfigured() ? (
                <PayBalanceButton appointmentId={apt.id} balanceOwingCents={balanceOwingCents} />
              ) : (
                <p className="rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">
                  Online balance payment is coming soon — the team can take payment in person, or get in touch to arrange it sooner.
                </p>
              )}
            </div>
          )}
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
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
