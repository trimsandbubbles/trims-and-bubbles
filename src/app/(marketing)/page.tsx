import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Sparkles, Droplets, Scissors, Wind, Car, ArrowRight, ArrowUpRight, Phone } from "lucide-react";
import { getActiveServicesWithPricing } from "@/lib/services-data";
import { formatCents } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { businessConfig } from "@/config/business";
import { getBusinessDetails } from "@/lib/business-data";
import { EditableText } from "@/components/site-content/editable-text";
import { EditableImage } from "@/components/site-content/editable-image";

const SERVICE_ICONS: Record<string, React.ElementType> = {
  "full-groom": Scissors,
  "wash-and-dry": Droplets,
  "wash-and-tidy": Sparkles,
  "groom-out": Wind,
  deshed: Wind,
  "nail-clipping-ear-cleaning": Sparkles,
  "pickup-and-dropoff": Car,
};

const SERVICE_PHOTOS: Record<string, string> = {
  "full-groom": "/service-images/service-2.jpg",
  "wash-and-dry": "/service-images/service-3.jpg",
  "wash-and-tidy": "/service-images/service-4.jpg",
  "groom-out": "/service-images/service-1.jpg",
  deshed: "/service-images/service-5.jpg",
  "nail-clipping-ear-cleaning": "/service-images/service-4.jpg",
};

export default async function HomePage() {
  const [services, galleryPhotos, business] = await Promise.all([
    getActiveServicesWithPricing(),
    prisma.appointmentPhoto.findMany({
      where: { isFeaturedOnPublicGallery: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    getBusinessDetails(),
  ]);

  const highlightServices = services.filter((s) => s.category === "CORE").slice(0, 4);
  const cheapestFullGroom = services
    .find((s) => s.slug === "full-groom")
    ?.prices.filter((p) => !p.isOnInspection)
    .sort((a, b) => a.priceCents - b.priceCents)[0];
  const phone = business.contactPhone;
  const telHref = `tel:${phone.replace(/\s+/g, "")}`;

  return (
    <div>
      {/* ---------------- Hero ---------------- */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
          <div>
            <p className="kicker">{businessConfig.location.region}</p>
            <EditableText
              contentKey="home.hero.headline"
              as="h1"
              multiline
              accentClassName="text-accent-solid"
              className="mt-6 text-5xl font-black leading-[1.05] text-balance sm:text-6xl"
            >{"Happy dogs,\nclean paws &\nwagging tails."}</EditableText>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground text-pretty">
              {businessConfig.tagline}. Gentle handling, unhurried appointments, and a groomer
              who has spent {businessConfig.credentials.yearsExperience} caring for dogs.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button size="lg" render={<Link href="/book" />}>
                Book an appointment <ArrowRight />
              </Button>
              <Button size="lg" variant="outline" render={<a href={telHref} />}>
                <Phone /> {phone}
              </Button>
            </div>
            {cheapestFullGroom && (
              <p className="mt-7 text-sm text-muted-foreground">
                Full grooms from{" "}
                <span className="font-extrabold text-foreground">{formatCents(cheapestFullGroom.priceCents)}</span>
                {" · Nail trim & ear clean from "}
                <span className="font-extrabold text-foreground">$15</span>
              </p>
            )}
          </div>

          {/* Warm image, soft corners, a floating coral bubble accent */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="relative aspect-4/5 w-full overflow-hidden rounded-2xl ring-1 ring-border">
              <EditableImage
                contentKey="home.hero.image"
                fallbackSrc="/seed-images/hero-main.jpg"
                alt="A happy, freshly groomed dog"
                fill
                priority
                className="object-cover"
                sizes="(min-width: 1024px) 44vw, 90vw"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Service highlights ---------------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <EditableText contentKey="home.services.kicker" as="p" className="kicker">Our services</EditableText>
            <EditableText contentKey="home.services.heading" as="h2" className="mt-4 text-3xl font-extrabold sm:text-4xl">A calm groom for every coat</EditableText>
          </div>
          <Link
            href="/services"
            className="group inline-flex items-center gap-1.5 text-sm font-bold hover:text-accent-solid"
          >
            View all services
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {highlightServices.map((service) => {
            const Icon = SERVICE_ICONS[service.slug] ?? Sparkles;
            const photo = SERVICE_PHOTOS[service.slug] ?? "/service-images/service-4.jpg";
            const fromPrice = service.prices
              .filter((p) => !p.isOnInspection)
              .sort((a, b) => a.priceCents - b.priceCents)[0];
            return (
              <div
                key={service.id}
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:-translate-y-1 hover:border-accent-solid/40 hover:shadow-lg hover:shadow-accent-solid/5"
              >
                <div className="relative aspect-4/3 w-full overflow-hidden">
                  <Image
                    src={photo}
                    alt={`${service.name} grooming service`}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 90vw"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-4 p-6">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-solid transition-colors group-hover:bg-accent-solid group-hover:text-accent-solid-foreground">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="text-lg font-extrabold">{service.name}</h3>
                  <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{service.description}</p>
                  {fromPrice && <p className="text-sm font-extrabold">From {formatCents(fromPrice.priceCents)}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------------- Story / trust strip ---------------- */}
      <section className="border-y border-border bg-secondary">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <p className="kicker justify-center">{businessConfig.credentials.yearsExperience} of care</p>
          <p className="mt-6 text-balance text-2xl font-extrabold leading-snug sm:text-3xl">
            {`After ${businessConfig.credentials.yearsExperience} welcoming dogs into our home for boarding, we're bringing that same care to washing, grooming & trimming.`}
          </p>
          <Link
            href="/about"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-accent-solid hover:underline underline-offset-4"
          >
            Read our story <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ---------------- Gallery teaser ---------------- */}
      {galleryPhotos.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <EditableText contentKey="home.gallery.kicker" as="p" className="kicker">Our work</EditableText>
              <EditableText contentKey="home.gallery.heading" as="h2" className="mt-4 text-3xl font-extrabold sm:text-4xl">Recent grooms</EditableText>
            </div>
            <Link
              href="/gallery"
              className="group inline-flex items-center gap-1.5 text-sm font-bold hover:text-accent-solid"
            >
              View gallery
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {galleryPhotos.map((photo, i) => (
              <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-2xl ring-1 ring-border">
                <Image
                  src={photo.url}
                  alt={photo.caption ?? "Groomed dog"}
                  fill
                  // First row (2 cols on mobile, where this section can be the
                  // LCP element below the hero) loads eagerly — found via the
                  // Hardening-milestone console-issue sweep as a Next.js LCP
                  // warning ("add loading=eager"), same fix already applied to
                  // the portal dashboard's own latest-photo image.
                  priority={i < 2}
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(min-width: 1024px) 16vw, 45vw"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------------- CTA ---------------- */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-accent-solid px-6 py-16 text-center text-accent-solid-foreground sm:py-20">
          <EditableText contentKey="home.cta.kicker" as="p" className="relative text-xs font-extrabold uppercase tracking-[0.2em] text-accent-solid-foreground/80">
            Book online in minutes
          </EditableText>
          <EditableText contentKey="home.cta.heading" as="h2" className="relative mt-4 text-3xl font-black text-balance sm:text-4xl">Ready to book your dog in?</EditableText>
          <EditableText contentKey="home.cta.text" as="p" className="relative mx-auto mt-4 max-w-lg text-accent-solid-foreground/90">
            Pick a service, choose a time that suits you, and we&apos;ll take it from there.
          </EditableText>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Button
              size="lg"
              render={<Link href="/book" />}
              className="bg-background text-foreground hover:bg-background/90"
            >
              Book Now <ArrowRight />
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<a href={telHref} />}
              className="border-white/40 bg-transparent text-accent-solid-foreground hover:bg-white/10 hover:text-accent-solid-foreground"
            >
              <Phone /> {phone}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
