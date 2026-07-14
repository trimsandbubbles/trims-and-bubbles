import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Dog } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddPetDialog } from "@/components/portal/add-pet-dialog";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SIZE_BAND_LABELS } from "@/lib/format";

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
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <Dog className="h-8 w-8" />
            <p>You haven&apos;t added a dog yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pets.map((pet) => (
            <Link key={pet.id} href={`/portal/pets/${pet.id}`} className="block">
              <Card className="h-full transition-colors hover:border-primary/50">
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
                    <p className="truncate font-medium">{pet.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{pet.breed ?? "Mixed breed"}</p>
                    <Badge variant="outline" className="mt-1.5">
                      {SIZE_BAND_LABELS[pet.sizeBand]}
                    </Badge>
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
