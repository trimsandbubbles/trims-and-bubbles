import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Dog } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddPetDialog } from "@/components/portal/add-pet-dialog";
import { EditPetDialog } from "@/components/pets/edit-pet-dialog";
import { RemovePetButton } from "@/components/pets/remove-pet-button";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SIZE_BAND_LABELS } from "@/lib/format";
import type { SizeBand } from "@/components/booking/types";

export const metadata: Metadata = { title: "My Dogs" };

export default async function PortalPetsPage() {
  const session = await getCurrentSession();
  const client = await prisma.client.findUnique({ where: { userId: session!.user.id } });
  const pets = client
    ? await prisma.pet.findMany({
        where: { clientId: client.id, archivedAt: null },
        orderBy: { createdAt: "asc" },
      })
    : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My Dogs</h1>
          <p className="mt-1 text-muted-foreground">Manage your dogs&apos; profiles and grooming needs.</p>
        </div>
        <AddPetDialog />
      </div>

      {pets.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
            <Dog className="h-8 w-8" />
            <p>You haven&apos;t added a dog yet.</p>
            <AddPetDialog />
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pets.map((pet) => (
            // The card itself is not a link — the profile area and the
            // Edit/Remove actions are siblings so real buttons can live in
            // the footer without nesting interactive elements.
            <Card key={pet.id} className="h-full transition-colors hover:border-primary/50">
              <Link href={`/portal/pets/${pet.id}`} className="group block">
                <CardContent className="flex items-center gap-4 py-5">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                    {pet.photoUrl ? (
                      <Image src={pet.photoUrl} alt={pet.name} fill className="object-cover" sizes="64px" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Dog className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium group-hover:text-accent-solid">{pet.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{pet.breed ?? "Mixed breed"}</p>
                    <Badge variant="outline" className="mt-1.5">
                      {SIZE_BAND_LABELS[pet.sizeBand]}
                    </Badge>
                    <span className="mt-2 flex items-center gap-1 text-xs font-bold text-accent-solid">
                      View profile <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </CardContent>
              </Link>
              <CardFooter className="flex items-center justify-between gap-2">
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
                <RemovePetButton petId={pet.id} petName={pet.name} redirectTo="/portal/pets" size="touch" />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
