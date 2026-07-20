import type { Metadata } from "next";
import { getActiveServicesWithPricing } from "@/lib/services-data";
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
  const [allServices, session, rules, modes, fixedSlots] = await Promise.all([
    getActiveServicesWithPricing(),
    getCurrentSession(),
    prisma.availabilityRule.findMany(),
    getDayModesMap(),
    getFixedSlotsMap(),
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

  return (
    <div>
      <AvailabilityGlance rules={rules} modes={modes} fixedSlots={fixedSlots} />
      <BookingWizard
        services={services}
        addOnServices={addOnServices}
        initialSession={session ? { name: session.user.name, email: session.user.email, phone } : null}
        initialPets={pets}
        closedWeekdays={closedWeekdays}
      />
      <div className="mx-auto max-w-2xl px-4 pb-14 sm:px-6">
        <NeedHelp />
      </div>
    </div>
  );
}
