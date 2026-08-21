import type { Metadata } from "next";
import { getActiveServicesWithPricing, getBusinessSettings } from "@/lib/services-data";
import { getCurrentSession } from "@/lib/session";
import { getMyPets } from "@/lib/actions/client-profile";
import { prisma } from "@/lib/prisma";
import { getDayModesMap, getFixedSlotsMap } from "@/lib/availability-data";
import { BookingWizard } from "@/components/booking/booking-wizard";
import type { ServiceDTO } from "@/components/booking/types";
import { AvailabilityGlance } from "@/components/booking/availability-glance";
import { NeedHelp } from "@/components/need-help";

export const metadata: Metadata = { title: "Book an Appointment" };

export default async function BookPage() {
  // "Today" as a Sydney calendar date, so we only surface upcoming one-off days.
  const todaySydney = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const [allServices, session, rules, modes, fixedSlots, settings, exceptions] = await Promise.all([
    getActiveServicesWithPricing(),
    getCurrentSession(),
    prisma.availabilityRule.findMany(),
    getDayModesMap(),
    getFixedSlotsMap(),
    getBusinessSettings(),
    prisma.availabilityException.findMany({
      where: { date: { gte: new Date(`${todaySydney}T00:00:00.000Z`) } },
      orderBy: { date: "asc" },
    }),
  ]);

  // Sizes are SMALL/MEDIUM/LARGE now (XL was removed from the offering). The DB
  // enum still technically includes XL, so drop any stray XL price rows and
  // narrow to the wizard's ServiceDTO shape.
  const toDTO = (list: typeof allServices): ServiceDTO[] =>
    list.map((s) => ({
      ...s,
      prices: s.prices
        .filter((p) => p.sizeBand !== "XL")
        .map((p) => ({ ...p, sizeBand: p.sizeBand as ServiceDTO["prices"][number]["sizeBand"] })),
    })) as ServiceDTO[];

  const services = toDTO(allServices.filter((s) => s.category === "CORE"));
  const addOnServices = toDTO(allServices.filter((s) => s.category === "ADD_ON"));

  let phone: string | null = null;
  let pets: Awaited<ReturnType<typeof getMyPets>> = [];
  if (session) {
    const client = await prisma.client.findUnique({ where: { userId: session.user.id } });
    phone = client?.phone ?? null;
    pets = await getMyPets();
  }

  // A weekday is open/bookable if: (mode is OPEN_HOURS and it has >=1 active
  // window) OR (mode is FIXED_SLOTS and it has >=1 active fixed slot). A day
  // switched to FIXED_SLOTS has its AvailabilityRule rows stored inactive, so
  // its openness must come from fixedSlots instead of the rule rows.
  const activeOpenHoursDays = new Set(rules.filter((r) => r.isActive).map((r) => r.dayOfWeek));
  const closedWeekdays = [0, 1, 2, 3, 4, 5, 6].filter((d) => {
    const mode = modes[d] ?? "OPEN_HOURS";
    const isOpen = mode === "FIXED_SLOTS" ? (fixedSlots[d]?.length ?? 0) > 0 : activeOpenHoursDays.has(d);
    return !isOpen;
  });

  // One-off overrides for specific dates (e.g. "special open days"). An open
  // exception makes a date bookable even on a normally-closed weekday; a CLOSED
  // exception blocks a normally-open date. These override the weekly rule for
  // just those calendar dates in the picker.
  const openExceptionDates = exceptions
    .filter((e) => e.type === "CUSTOM_SLOTS" || e.type === "CUSTOM_HOURS")
    .map((e) => e.date.toISOString().slice(0, 10));
  const closedExceptionDates = exceptions.filter((e) => e.type === "CLOSED").map((e) => e.date.toISOString().slice(0, 10));

  // "Extra availability" banner: the span of upcoming special open days.
  const rangeFmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long" });
  const specialOpenLabel =
    openExceptionDates.length > 0
      ? `Extra availability: ${rangeFmt.format(new Date(`${openExceptionDates[0]}T00:00:00`))} – ${rangeFmt.format(
          new Date(`${openExceptionDates[openExceptionDates.length - 1]}T00:00:00`),
        )}`
      : null;

  return (
    <div>
      <AvailabilityGlance rules={rules} modes={modes} fixedSlots={fixedSlots} specialOpenLabel={specialOpenLabel} />
      <BookingWizard
        services={services}
        addOnServices={addOnServices}
        initialSession={session ? { name: session.user.name, email: session.user.email, phone } : null}
        initialPets={pets}
        closedWeekdays={closedWeekdays}
        openExceptionDates={openExceptionDates}
        closedExceptionDates={closedExceptionDates}
        bookingAddress={settings.bookingAddress ?? null}
      />
      <div className="mx-auto max-w-2xl px-4 pb-14 sm:px-6">
        <NeedHelp />
      </div>
    </div>
  );
}
