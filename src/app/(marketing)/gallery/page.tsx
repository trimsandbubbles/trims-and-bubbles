import type { Metadata } from "next";
import Image from "next/image";
import { PawPrint } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { EditableText } from "@/components/site-content/editable-text";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Recent grooms from Trims and Bubbles, organized by service.",
};

/** Standalone gallery images with no group label fall in here, alongside
 * whatever service-named groups the featured appointment photos produce. */
const DEFAULT_GROUP_LABEL = "Recent grooms";

/** Its own always-visible section (even while empty), so it's excluded from
 * the generic grouped map below to avoid rendering it twice. */
const DOG_FRIENDS_GROUP_LABEL = "Dog friends over the years";

export default async function GalleryPage() {
  const [photos, standaloneImages] = await Promise.all([
    prisma.appointmentPhoto.findMany({
      where: { isFeaturedOnPublicGallery: true },
      orderBy: { createdAt: "desc" },
      include: {
        appointment: {
          include: { primaryService: true, pet: true },
        },
      },
    }),
    prisma.galleryImage.findMany({
      where: { active: true },
      orderBy: { displayOrder: "asc" },
    }),
  ]);

  const grouped = new Map<string, { url: string; caption: string }[]>();
  const dogFriendsItems: { url: string; caption: string }[] = [];
  for (const photo of photos) {
    const group = photo.appointment.primaryService.name;
    const entry = { url: photo.url, caption: photo.caption ?? `${photo.appointment.pet.name} — ${group}` };
    grouped.set(group, [...(grouped.get(group) ?? []), entry]);
  }
  for (const image of standaloneImages) {
    const group = image.groupLabel?.trim() || DEFAULT_GROUP_LABEL;
    const entry = { url: image.url, caption: image.caption ?? group };
    // Rendered in its own always-visible section below — keep it out of the
    // generic grouped map so it isn't rendered a second time by the loop.
    if (group === DOG_FRIENDS_GROUP_LABEL) {
      dogFriendsItems.push(entry);
      continue;
    }
    grouped.set(group, [...(grouped.get(group) ?? []), entry]);
  }

  const groups = Array.from(grouped.entries());
  let photoIndex = -1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="max-w-2xl">
        <EditableText contentKey="gallery.intro.heading" as="h1" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Gallery
        </EditableText>
        <EditableText contentKey="gallery.intro.text" as="p" className="mt-3 text-muted-foreground text-pretty">
          A few recent grooms, organized by service so you can see what to expect for your own
          dog&apos;s coat type.
        </EditableText>
      </div>

      <div className="mt-10 space-y-14">
        {groups.length === 0 && dogFriendsItems.length === 0 && (
          <EditableText contentKey="gallery.empty" as="p" className="text-muted-foreground">
            Photos are on their way — check back soon.
          </EditableText>
        )}

        <div>
          <EditableText contentKey="gallery.dogFriends.heading" as="h2" className="text-xl font-semibold tracking-tight">
            {DOG_FRIENDS_GROUP_LABEL}
          </EditableText>
          {dogFriendsItems.length === 0 ? (
            <div className="mt-5 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-12 text-center text-muted-foreground">
              <PawPrint className="h-6 w-6" aria-hidden />
              <EditableText contentKey="gallery.dogFriends.empty" as="p" className="text-sm text-pretty">
                Photos of the dogs we&apos;ve cared for over the years are coming soon.
              </EditableText>
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {dogFriendsItems.map((item, i) => {
                photoIndex++;
                return (
                  <figure key={i} className="group overflow-hidden rounded-xl border border-border">
                    <div className="relative aspect-square overflow-hidden">
                      <Image
                        src={item.url}
                        alt={item.caption}
                        fill
                        priority={photoIndex === 0}
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        sizes="(min-width: 1024px) 22vw, 45vw"
                      />
                    </div>
                    <figcaption className="px-3 py-2 text-xs text-muted-foreground">{item.caption}</figcaption>
                  </figure>
                );
              })}
            </div>
          )}
        </div>

        {groups.map(([group, items]) => (
          <div key={group}>
            <h2 className="text-xl font-semibold tracking-tight">{group}</h2>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item, i) => {
                photoIndex++;
                return (
                  <figure key={i} className="group overflow-hidden rounded-xl border border-border">
                    <div className="relative aspect-square overflow-hidden">
                      <Image
                        src={item.url}
                        alt={item.caption}
                        fill
                        priority={photoIndex === 0}
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        sizes="(min-width: 1024px) 22vw, 45vw"
                      />
                    </div>
                    <figcaption className="px-3 py-2 text-xs text-muted-foreground">{item.caption}</figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
