import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getActiveServicesWithPricing } from "@/lib/services-data";
import { getDayModesMap, getFixedSlotsMap } from "@/lib/availability-data";
import { ManualBookingForm, type ManualClientDTO, type ManualServiceDTO } from "@/components/admin/manual-booking-form";

export const metadata: Metadata = { title: "New booking | Admin" };

export default async function AdminNewBookingPage() {
  const session = await getCurrentSession();
  if (session?.user.role !== "owner" && session?.user.role !== "staff") redirect("/admin");

  const [allServices, clients, rules, modes, fixedSlots] = await Promise.all([
    getActiveServicesWithPricing(),
    prisma.client.findMany({
      include: {
        user: true,
        pets: { where: { archivedAt: null }, orderBy: { name: "asc" } },
      },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.availabilityRule.findMany(),
    getDayModesMap(),
    getFixedSlotsMap(),
  ]);

  const services: ManualServiceDTO[] = allServices
    .filter((s) => s.category === "CORE")
    .map((s) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.durationMinutes,
      prices: s.prices.map((p) => ({ sizeBand: p.sizeBand, priceCents: p.priceCents, isOnInspection: p.isOnInspection })),
    }));

  const clientDTOs: ManualClientDTO[] = clients.map((c) => ({
    id: c.id,
    name: c.user.name,
    phone: c.phone,
    pets: c.pets.map((p) => ({ id: p.id, name: p.name, sizeBand: p.sizeBand, breed: p.breed })),
  }));

  // A weekday is bookable if it's OPEN_HOURS with an active window, or
  // FIXED_SLOTS with at least one active slot — mirrors the public book page.
  const activeOpenHoursDays = new Set(rules.filter((r) => r.isActive).map((r) => r.dayOfWeek));
  const closedWeekdays = [0, 1, 2, 3, 4, 5, 6].filter((d) => {
    const mode = modes[d] ?? "OPEN_HOURS";
    const isOpen = mode === "FIXED_SLOTS" ? (fixedSlots[d]?.length ?? 0) > 0 : activeOpenHoursDays.has(d);
    return !isOpen;
  });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">New booking</h1>
      <p className="mt-1 text-muted-foreground">
        Add a booking for a customer who called or emailed. They&apos;ll get a confirmation email if you include one.
      </p>
      <div className="mt-6">
        <ManualBookingForm clients={clientDTOs} services={services} closedWeekdays={closedWeekdays} />
      </div>
    </div>
  );
}
