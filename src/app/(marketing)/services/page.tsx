import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveServicesWithPricing } from "@/lib/services-data";
import { formatCents, SIZE_BAND_LABELS, SIZE_BAND_HINTS } from "@/lib/format";
import { businessConfig } from "@/config/business";
import { getBusinessDetails } from "@/lib/business-data";
import { EditableText } from "@/components/site-content/editable-text";

export const metadata: Metadata = {
  title: "Services & Pricing",
  description: "Full grooming service list and pricing by dog size for Trims and Bubbles.",
};

const SIZE_ORDER = ["SMALL", "MEDIUM", "LARGE"] as const;

const SERVICE_PHOTOS: Record<string, string> = {
  "full-groom": "/service-images/service-2.jpg",
  "wash-and-dry": "/service-images/service-3.jpg",
  "wash-and-tidy": "/service-images/service-4.jpg",
  "groom-out": "/service-images/service-1.jpg",
  deshed: "/service-images/service-5.jpg",
  "nail-clipping-ear-cleaning": "/service-images/service-4.jpg",
};

const SUITABILITY = [
  {
    slug: "full-groom",
    heading: "Full Groom suits",
    text: "Curly, non-shedding coats that need regular clipping to stay mat-free — Poodles, Cavoodles, Schnauzers, Bichons, and other oodle-type crosses.",
  },
  {
    slug: "groom-out",
    heading: "Groom Out suits",
    text: "Longer double coats that need de-bulking rather than a short clip — Border Collies, German Shepherds, Golden Retrievers, and Husky-type breeds.",
  },
  {
    slug: "deshed",
    heading: "Deshed suits",
    text: "Smooth or short double coats that blow their undercoat seasonally — Kelpies, Cattle Dogs, Labradors, and Staffy-type breeds.",
  },
  {
    slug: "wash-and-tidy",
    heading: "Wash and Tidy suits",
    text: "Coats that just need the edges neatened — face, feet and sanitary areas — without a full restyle. A good fit for Shih Tzus and similar longer-coated companion breeds.",
  },
];

const ADD_ONS = [
  { slug: "matting-removal", name: "Matting removal", price: "From $25, depending on severity — assessed at drop-off" },
  { slug: "styled-finish", name: "Styled finish (bandana, bow, or spray cologne)", price: "$5" },
];

export default async function ServicesPage() {
  const [services, business] = await Promise.all([getActiveServicesWithPricing(), getBusinessDetails()]);
  const coreServices = services.filter((s) => s.category === "CORE" && s.slug !== "nail-clipping-ear-cleaning");
  const flatServices = services.filter((s) => s.prices.length === 1 && s.prices[0].sizeBand === null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <div className="max-w-2xl">
        <EditableText contentKey="services.intro.heading" as="h1" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Services &amp; Pricing
        </EditableText>
        <EditableText contentKey="services.intro.text" as="p" className="mt-3 text-muted-foreground text-pretty">
          Every groom starts with a quick health-and-coat check, a warm bath with a
          coat-appropriate shampoo, and your dog&apos;s comfort as the top priority. Prices below
          are guided by your dog&apos;s size — see the table for details.
        </EditableText>
      </div>

      {/* Service descriptions */}
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {coreServices.map((service) => (
          <Card key={service.id} className="pt-0">
            <div className="relative aspect-4/3 w-full overflow-hidden rounded-t-md">
              <Image
                src={service.imageUrl ?? SERVICE_PHOTOS[service.slug] ?? "/service-images/service-4.jpg"}
                alt={`${service.name} grooming service`}
                fill
                className="object-cover"
                sizes="(min-width: 640px) 45vw, 90vw"
              />
            </div>
            <CardHeader>
              <CardTitle className="text-lg">{service.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{service.description}</p>
              <p className="mt-3 text-xs text-muted-foreground">~{service.durationMinutes} minutes</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pricing matrix */}
      <div className="mt-14">
        <EditableText contentKey="services.pricing.heading" as="h2" className="text-2xl font-semibold tracking-tight">
          Pricing by size
        </EditableText>
        <p className="mt-2 text-sm text-muted-foreground">
          Sizes are a guide based on weight: Small ({SIZE_BAND_HINTS.SMALL}), Medium (
          {SIZE_BAND_HINTS.MEDIUM}), Large ({SIZE_BAND_HINTS.LARGE}).
        </p>
        <EditableText contentKey="services.pricing.swipeHint" as="p" className="mt-4 text-xs text-muted-foreground sm:hidden">
          Swipe sideways to see all sizes →
        </EditableText>
        <div className="mt-2 overflow-x-auto rounded-xl border border-border sm:mt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-40">Service</TableHead>
                {SIZE_ORDER.map((band) => (
                  <TableHead key={band} className="text-right">
                    {SIZE_BAND_LABELS[band]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {coreServices.map((service) => (
                <TableRow key={service.id}>
                  <TableCell className="font-medium">{service.name}</TableCell>
                  {SIZE_ORDER.map((band) => {
                    const price = service.prices.find((p) => p.sizeBand === band);
                    return (
                      <TableCell key={band} className="text-right tabular-nums">
                        {!price ? (
                          "—"
                        ) : price.isOnInspection ? (
                          <span className="text-muted-foreground">On inspection</span>
                        ) : (
                          formatCents(price.priceCents)
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <EditableText contentKey="services.pricing.disclaimer" as="p" className="mt-3 text-xs text-muted-foreground">
          All prices are a guide only. Heavily matted coats, unusually thick/long coats, or dogs
          needing extra time or handling may incur an adjusted price — always confirmed with you
          before we start.
        </EditableText>
      </div>

      {/* Flat-fee & add-ons */}
      <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-2">
        <div>
          <EditableText contentKey="services.quickServices.heading" as="h2" className="text-xl font-semibold tracking-tight">
            Quick services
          </EditableText>
          <ul className="mt-4 space-y-3">
            {flatServices.map((service) => (
              <li key={service.id} className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="font-medium">{service.name}</p>
                  <p className="text-sm text-muted-foreground">{service.description}</p>
                </div>
                <p className="shrink-0 pl-4 font-medium tabular-nums">
                  {formatCents(service.prices[0].priceCents)}
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <EditableText contentKey="services.addons.heading" as="h2" className="text-xl font-semibold tracking-tight">
            Add-ons
          </EditableText>
          <ul className="mt-4 space-y-3">
            {ADD_ONS.map((addon) => (
              <li key={addon.name} className="flex items-center justify-between rounded-lg border border-border p-4">
                <EditableText contentKey={`services.addons.${addon.slug}.name`} as="p" className="font-medium">
                  {addon.name}
                </EditableText>
                <EditableText
                  contentKey={`services.addons.${addon.slug}.price`}
                  as="p"
                  className="shrink-0 pl-4 text-right text-sm text-muted-foreground"
                >
                  {addon.price}
                </EditableText>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Which service suits your dog */}
      <div className="mt-14">
        <EditableText contentKey="services.suitability.heading" as="h2" className="text-2xl font-semibold tracking-tight">
          Not sure which service you need?
        </EditableText>
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {SUITABILITY.map((s) => (
            <div key={s.slug} className="rounded-xl bg-muted/60 p-5">
              <EditableText contentKey={`services.suitability.${s.slug}.heading`} as="h3" className="font-semibold">
                {s.heading}
              </EditableText>
              <EditableText
                contentKey={`services.suitability.${s.slug}.text`}
                as="p"
                className="mt-2 text-sm text-muted-foreground"
              >
                {s.text}
              </EditableText>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Still not sure? <Link href="/contact" className="font-medium text-foreground underline underline-offset-4">Get in touch</Link> and we&apos;ll help you pick — or just mention it when you book.
        </p>
      </div>

      {/* Contact block */}
      <div className="mt-14 rounded-2xl border border-border bg-sidebar p-8 text-center">
        <EditableText contentKey="services.contactBlock.heading" as="h2" className="text-xl font-semibold">
          Ready to book?
        </EditableText>
        <p className="mt-2 text-muted-foreground">
          {businessConfig.location.region} · {business.contactPhone}
        </p>
        <Button size="lg" render={<Link href="/book" />} className="mt-5">
          Book Now
        </Button>
      </div>
    </div>
  );
}
