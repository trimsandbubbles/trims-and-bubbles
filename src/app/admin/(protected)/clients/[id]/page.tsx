import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Dog, Mail, MessageSquare, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppointmentStatusBadge } from "@/components/status-badge";
import { ClientNotesForm } from "@/components/admin/client-notes-form";
import { SendMessageForm } from "@/components/admin/send-message-form";
import { prisma } from "@/lib/prisma";
import { formatCents, SIZE_BAND_LABELS } from "@/lib/format";

export const metadata: Metadata = { title: "Client | Admin" };

export default async function AdminClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      user: true,
      pets: { where: { archivedAt: null }, orderBy: { createdAt: "asc" } },
      appointments: {
        orderBy: { startAt: "desc" },
        include: { pet: true, primaryService: true },
      },
      messages: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!client) notFound();

  const dateTimeFmt = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/clients" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Clients
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{client.user.name}</h1>
          <div className="mt-2 flex flex-col gap-1 text-sm">
            {client.phone && (
              <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" /> {client.phone}
              </a>
            )}
            <a href={`mailto:${client.user.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" /> {client.user.email}
            </a>
          </div>
        </div>
        {client.marketingOptIn && <Badge variant="outline">Marketing opt-in</Badge>}
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-sm font-semibold">Private notes (only you and staff can see these)</h2>
        <ClientNotesForm clientId={client.id} initialNotes={client.internalNotes} />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4.5 w-4.5 text-primary" /> Messages
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <SendMessageForm clientId={client.id} />

          {client.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages sent to this client yet.</p>
          ) : (
            <div className="space-y-3">
              {client.messages.map((msg) => (
                <div key={msg.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">{dateTimeFmt.format(msg.createdAt)}</p>
                    <div className="flex items-center gap-2">
                      {msg.emailedAt && (
                        <Badge variant="outline" className="text-xs font-normal">
                          Emailed
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{msg.readAt ? "Seen" : "Unread"}</span>
                    </div>
                  </div>
                  {msg.subject && <p className="mt-1 text-sm font-medium">{msg.subject}</p>}
                  <p className="mt-1 whitespace-pre-wrap text-sm">{msg.body}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <h2 className="mt-8 mb-3 flex items-center gap-2 text-lg font-semibold">
        <Dog className="h-4.5 w-4.5 text-primary" /> Dogs
      </h2>
      {client.pets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No dogs on file yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {client.pets.map((pet) => (
            <Link key={pet.id} href={`/admin/pets/${pet.id}`}>
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted">
                    {pet.photoUrl ? (
                      <Image src={pet.photoUrl} alt={pet.name} fill className="object-cover" sizes="56px" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Dog className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{pet.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {pet.breed ?? "Mixed breed"} · {SIZE_BAND_LABELS[pet.sizeBand]}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <h2 className="mt-8 mb-3 flex items-center gap-2 text-lg font-semibold">
        <Clock className="h-4.5 w-4.5 text-primary" /> Appointment history
      </h2>
      {client.appointments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No appointments yet.</p>
      ) : (
        <div className="space-y-2">
          {client.appointments.map((apt) => (
            <Link key={apt.id} href={`/admin/appointments/${apt.id}`} className="block">
              <Card className="transition-colors hover:border-primary/50">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {apt.primaryService.name} for {apt.pet.name}
                    </p>
                    <p className="text-muted-foreground">{dateTimeFmt.format(apt.startAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{formatCents(apt.totalPriceCents)}</span>
                    <AppointmentStatusBadge status={apt.status} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
