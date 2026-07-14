import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getAvailableSlotsForDate, totalDurationMinutes } from "@/lib/availability-data";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  serviceId: z.string().min(1),
  addOnIds: z.string().optional(),
});

/**
 * Read-only slot lookup — deliberately a Route Handler rather than a Server
 * Action, since the booking wizard calls this repeatedly as the client clicks
 * around dates (Server Actions are dispatched sequentially per client and are
 * meant for mutations, not this kind of repeated read).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    date: searchParams.get("date") ?? undefined,
    serviceId: searchParams.get("serviceId") ?? undefined,
    addOnIds: searchParams.get("addOnIds") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { date, serviceId, addOnIds } = parsed.data;
  const addOnIdList = addOnIds ? addOnIds.split(",").filter(Boolean) : [];

  const [service, addOns] = await Promise.all([
    prisma.service.findUnique({ where: { id: serviceId } }),
    addOnIdList.length
      ? prisma.service.findMany({ where: { id: { in: addOnIdList }, active: true } })
      : Promise.resolve([]),
  ]);

  if (!service || !service.active) {
    return NextResponse.json({ error: "Unknown service" }, { status: 404 });
  }

  const duration = totalDurationMinutes(
    service.durationMinutes,
    addOns.map((a) => a.durationMinutes),
  );

  const slots = await getAvailableSlotsForDate(date, duration);

  return NextResponse.json({
    slots: slots.map((s) => ({ startAt: s.startAt.toISOString(), endAt: s.endAt.toISOString() })),
  });
}
