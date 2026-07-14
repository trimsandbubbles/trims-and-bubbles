import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Dog, ImageIcon, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppointmentStatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";
import { SIZE_BAND_LABELS } from "@/lib/format";

export const metadata: Metadata = { title: "Dog Profile | Admin" };

export default async function AdminPetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const pet = await prisma.pet.findUnique({
    where: { id },
    include: { client: { include: { user: true } } },
  });
  if (!pet) notFound();

  const appointments = await prisma.appointment.findMany({
    where: { petId: pet.id },
    orderBy: { startAt: "desc" },
    include: { primaryService: true, addOns: { include: { service: true } }, photos: true },
  });

  const dateFmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/admin/clients/${pet.client.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {pet.client.user.name}
      </Link>

      <Card className="mt-4">
        <CardContent className="flex flex-wrap items-center gap-5 py-5">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
            {pet.photoUrl ? (
              <Image src={pet.photoUrl} alt={pet.name} fill className="object-cover" sizes="96px" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Dog className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{pet.name}</h1>
            <p className="text-muted-foreground">{pet.breed ?? "Mixed breed"}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline">{SIZE_BAND_LABELS[pet.sizeBand]}</Badge>
              {pet.coatType && <Badge variant="outline">{pet.coatType}</Badge>}
            </div>
          </div>
        </CardContent>
        <CardContent className="border-t border-border pt-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <User className="h-4 w-4 text-primary" /> Owner
          </p>
          <Link href={`/admin/clients/${pet.client.id}`} className="mt-1 text-primary underline underline-offset-4">
            {pet.client.user.name}
          </Link>
          {pet.temperamentNotes && (
            <>
              <p className="mt-3 font-medium">Good to know</p>
              <p className="mt-1 text-muted-foreground">{pet.temperamentNotes}</p>
            </>
          )}
        </CardContent>
      </Card>

      <h2 className="mt-10 mb-4 flex items-center gap-2 text-lg font-semibold">
        <CalendarDays className="h-4.5 w-4.5 text-primary" /> Grooming history
      </h2>

      {appointments.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">No appointments yet for {pet.name}.</CardContent>
        </Card>
      ) : (
        <ol className="space-y-4 border-l border-border pl-6">
          {appointments.map((apt) => (
            <li key={apt.id} className="relative">
              <span className="absolute top-1.5 -left-[29px] h-3 w-3 rounded-full border-2 border-background bg-primary" />
              <Link href={`/admin/appointments/${apt.id}`} className="block">
                <Card className="transition-colors hover:border-primary/50">
                  <CardContent className="space-y-2 py-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{dateFmt.format(apt.startAt)}</p>
                      <AppointmentStatusBadge status={apt.status} />
                    </div>
                    <p>
                      {apt.primaryService.name}
                      {apt.addOns.length > 0 && <span className="text-muted-foreground"> + {apt.addOns.map((a) => a.service.name).join(", ")}</span>}
                    </p>
                    {apt.groomerNote && <p className="text-muted-foreground italic">&ldquo;{apt.groomerNote}&rdquo;</p>}
                    {apt.photos.length > 0 && (
                      <div className="flex items-center gap-1.5 pt-1 text-muted-foreground">
                        <ImageIcon className="h-3.5 w-3.5" /> {apt.photos.length} photo{apt.photos.length > 1 ? "s" : ""}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
