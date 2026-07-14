import { prisma } from "@/lib/prisma";

/** All active services with their size-based pricing, in display order. Used by
 * the public /services page and the booking wizard. */
export async function getActiveServicesWithPricing() {
  return prisma.service.findMany({
    where: { active: true },
    orderBy: { displayOrder: "asc" },
    include: {
      prices: {
        orderBy: [{ sizeBand: "asc" }],
      },
    },
  });
}

export async function getBusinessSettings() {
  const settings = await prisma.businessSettings.findUnique({ where: { id: 1 } });
  return (
    settings ?? {
      id: 1,
      depositPercentage: 20,
      businessName: "Trims and Bubbles",
      contactPhone: null,
      contactEmail: null,
      socials: null,
      bufferMinutes: 15,
      updatedAt: new Date(),
    }
  );
}
