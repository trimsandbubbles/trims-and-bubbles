import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Dog, ImageIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppointmentStatusBadge } from "@/components/status-badge";
import { EditPetDialog } from "@/components/pets/edit-pet-dialog";
import { RemovePetButton } from "@/components/pets/remove-pet-button";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SIZE_BAND_LABELS } from "@/lib/format";
import type { SizeBand } from "@/components/booking/types";

export const metadata: Metadata = { title: "Dog Profile" };

export default async function PortalPetDetailPage({ params }: { params: Promise<{ petId: string }> }) {
  const { petId } = await params;
  const session = await getCurrentSession();
  const client = await prisma.client.findUnique({ where: { userId: session!.user.id } });
  if (!client) notFound();

  const pet = await prisma.pet.findFirst({ where: { id: petId, clientId: client.id } });
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
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/portal/pets" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> My Dogs
        </Link>
        <div className="flex flex-wrap gap-2">
          <EditPetDialog
            pet={{
              id: pet.id,
              name: pet.name,
              breed: pet.breed,
              sizeBand: pet.sizeBand as SizeBand,
              weightKg: pet.weightKg,
              coatType: pet.coatType,
              temperamentNotes: pet.temperamentNotes,
            }}
          />
          <RemovePetButton petId={pet.id} petName={pet.name} redirectTo="/portal/pets" />
        </div>
      </div>

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
        {pet.temperamentNotes && (
          <CardContent className="border-t border-border pt-4 text-sm">
            <p className="font-medium">Good to know</p>
            <p className="mt-1 text-muted-foreground">{pet.temperamentNotes}</p>
          </CardContent>
        )}
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
              <Link href={`/portal/appointments/${apt.id}`} className="block">
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
