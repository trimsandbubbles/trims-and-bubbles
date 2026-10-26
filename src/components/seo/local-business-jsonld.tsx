import { prisma } from "@/lib/prisma";
import { getBusinessDetails } from "@/lib/business-data";
import { getActiveServicesWithPricing } from "@/lib/services-data";
import { getDayModesMap, getFixedSlotsMap } from "@/lib/availability-data";
import { resolveWeeklyDisplay, mergeAdjacentRanges } from "@/lib/weekly-hours";

/**
 * LocalBusiness structured data (JSON-LD) for the home page. Lets Google show
 * rich info in search results — opening hours, phone, price range, and the
 * star rating from real approved reviews. Everything is pulled live from the
 * owner's actual settings/availability/reviews, so it never goes stale.
 *
 * Note: only the SUBURB is published (never the private drop-off street
 * address), matching the rest of the public site.
 */

const SITE_URL = "https://trimsandbubbles.com.au";
// schema.org uses full English weekday names, indexed 0=Sunday..6=Saturday.
const SCHEMA_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toIntlPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^0/, "");
  return `+61${digits}`;
}

export async function LocalBusinessJsonLd() {
  const [business, rules, modes, fixedSlots, services, reviewAgg] = await Promise.all([
    getBusinessDetails(),
    prisma.availabilityRule.findMany(),
    getDayModesMap(),
    getFixedSlotsMap(),
    getActiveServicesWithPricing(),
    prisma.review.aggregate({ where: { approved: true, hidden: false }, _avg: { rating: true }, _count: true }),
  ]);

  const openingHoursSpecification = resolveWeeklyDisplay(rules, modes, fixedSlots)
    .filter((d) => d.isOpen && d.ranges.length > 0)
    .map((d) => {
      const span = mergeAdjacentRanges(d.ranges);
      return {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: `https://schema.org/${SCHEMA_DAYS[d.dayOfWeek]}`,
        opens: span[0].startTime,
        closes: span[span.length - 1].endTime,
      };
    });

  const prices = services.flatMap((s) => s.prices.filter((p) => !p.isOnInspection).map((p) => p.priceCents));
  const priceRange = prices.length
    ? `$${Math.round(Math.min(...prices) / 100)}–$${Math.round(Math.max(...prices) / 100)}`
    : undefined;

  const sameAs = [business.instagramUrl, business.facebookUrl, business.tiktokUrl, business.youtubeUrl].filter(Boolean);

  const reviewCount = reviewAgg._count;
  const avgRating = reviewAgg._avg.rating;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${SITE_URL}/#business`,
    name: business.businessName,
    description:
      "Professional dog washing, grooming and trimming in Dunlop, Canberra — full grooms, wash & dry, deshedding and nail care.",
    url: SITE_URL,
    image: `${SITE_URL}/opengraph-image.png`,
    logo: `${SITE_URL}/icon.png`,
    telephone: toIntlPhone(business.contactPhone),
    email: business.contactEmail,
    address: {
      "@type": "PostalAddress",
      addressLocality: "Dunlop",
      addressRegion: "ACT",
      postalCode: "2615",
      addressCountry: "AU",
    },
    areaServed: "Canberra, ACT",
    currenciesAccepted: "AUD",
    paymentAccepted: "Cash, Credit Card, Debit Card",
    ...(priceRange ? { priceRange } : {}),
    ...(openingHoursSpecification.length ? { openingHoursSpecification } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(reviewCount > 0 && avgRating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: avgRating.toFixed(1),
            reviewCount: reviewCount,
          },
        }
      : {}),
  };

  return (
    <script
      type="application/ld+json"
      // Rendered from our own trusted server (owner-only) data. JSON.stringify
      // handles quoting; we also escape "<" so a value can never break out of the
      // <script> tag (defence-in-depth). Kept minimal and stable for Google.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
    />
  );
}
