import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { GalleryManager } from "@/components/admin/gallery-manager";

export const metadata: Metadata = { title: "Gallery | Admin" };

export default async function AdminGalleryPage() {
  const [images, appointmentPhotos] = await Promise.all([
    prisma.galleryImage.findMany({ orderBy: { displayOrder: "asc" } }),
    prisma.appointmentPhoto.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        appointment: {
          include: { pet: true, primaryService: true },
        },
      },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Gallery</h1>
      <p className="mt-1 text-muted-foreground">
        Add photos for the public gallery, or feature a photo from a completed appointment.
      </p>

      <div className="mt-6">
        <GalleryManager
          images={images.map((img) => ({
            id: img.id,
            url: img.url,
            caption: img.caption,
            groupLabel: img.groupLabel,
            displayOrder: img.displayOrder,
            active: img.active,
          }))}
          appointmentPhotos={appointmentPhotos.map((p) => ({
            id: p.id,
            url: p.url,
            caption: p.caption,
            isFeaturedOnPublicGallery: p.isFeaturedOnPublicGallery,
            petName: p.appointment.pet.name,
            serviceName: p.appointment.primaryService.name,
            createdAt: p.createdAt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }),
          }))}
        />
      </div>
    </div>
  );
}
