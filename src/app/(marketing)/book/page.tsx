import type { Metadata } from "next";
import { getActiveServicesWithPricing } from "@/lib/services-data";
import { getCurrentSession } from "@/lib/session";
import { getMyPets } from "@/lib/actions/client-profile";
import { prisma } from "@/lib/prisma";
import { BookingWizard } from "@/components/booking/booking-wizard";
import type { ServiceDTO } from "@/components/booking/types";
import { AvailabilityGlance } from "@/components/booking/availability-glance";
import { NeedHelp } from "@/components/need-help";

export const metadata: Metadata = { title: "Book an Appointment" };

export default async function BookPage() {
  const [allServices, session, rules] = await Promise.all([
    getActiveServicesWithPricing(),
    getCurrentSession(),
    prisma.availabilityRule.findMany(),
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

  const activeDays = new Set(rules.filter((r) => r.isActive).map((r) => r.dayOfWeek));
  const closedWeekdays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !activeDays.has(d));

  return (
    <div>
      <AvailabilityGlance rules={rules} />
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
